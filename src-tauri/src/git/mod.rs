//! Lightweight git introspection.
//!
//! Reado treats git as the user's own tool and only reads from it. Rather than
//! link a native git library, we shell out to the `git` binary for the two facts
//! the MVP needs: whether a folder is a repository, and its current branch.
//! Git-dependent features degrade gracefully when `git` is absent.

mod blame;
mod branch;
mod conflict;
mod diff;
#[cfg(test)]
pub(crate) mod diff_tests;
mod graph;
mod hunk;
mod remote;
mod rewrite;
mod signing;
mod specialized;
mod stash;
mod status;
mod worktree;

pub use blame::*;
pub use branch::*;
pub use conflict::*;
pub use diff::*;
pub use graph::*;
pub use hunk::*;
pub use remote::*;
pub use rewrite::*;
pub use signing::*;
pub use specialized::*;
pub use stash::*;
pub use status::*;
pub use worktree::*;

use crate::proc::{command, GIT_NO_DIFF_DRIVERS};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Build a diff without executable drivers, text conversion or untrusted filters.
pub(crate) fn diff_command(root: &Path) -> Command {
    let mut cmd = command("git");
    cmd.arg("-C")
        .arg(root)
        .args(filter_overrides(root))
        .arg("diff")
        .args(GIT_NO_DIFF_DRIVERS);
    cmd
}

/// The subcommands Reado runs on its own to read a repository. Only these get
/// [`filter_overrides`]: a write (`add`, `commit`, `stash`, `checkout`…) must keep the
/// repository's filters, or git-crypt would commit plaintext and LFS the raw file.
const READS: [&str; 6] = ["status", "diff", "blame", "log", "ls-files", "show"];

/// Filter programs a read may still run: tools the user installed, matched by bare
/// name so a repository can't swap in a script of its own under the same role.
const TRUSTED_FILTERS: [&str; 2] = ["git-lfs", "git-crypt"];

type FilterCache = Mutex<HashMap<PathBuf, (Instant, Vec<String>)>>;

/// `-c` overrides that switch off every clean/smudge/process filter driver the
/// repository configures, except [`TRUSTED_FILTERS`]. `git status` and `git diff`
/// run a file's filter to compare the work tree, so without this a folder received as
/// a zip could run code just by being opened (the GitSpawn class, via filters).
///
/// ponytail: cached per root for a few seconds, since status polls often. A filter
/// already configured when a folder is opened is caught on the first read; one added
/// to the config afterwards is caught once the entry expires.
pub(crate) fn filter_overrides(root: &Path) -> Vec<String> {
    const TTL: Duration = Duration::from_secs(5);
    static CACHE: OnceLock<FilterCache> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some((at, overrides)) = cache.lock().ok().and_then(|c| c.get(root).cloned()) {
        if at.elapsed() < TTL {
            return overrides;
        }
    }
    let config = command("git")
        .arg("-C")
        .arg(root)
        .args([
            "config",
            "--get-regexp",
            r"^filter\..*\.(clean|smudge|process)$",
        ])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    let overrides = untrusted_filter_overrides(&config);
    if let Ok(mut c) = cache.lock() {
        c.insert(root.to_path_buf(), (Instant::now(), overrides.clone()));
    }
    overrides
}

/// The overrides for `git config --get-regexp` output (`filter.<name>.<kind> <cmd>`).
fn untrusted_filter_overrides(config: &str) -> Vec<String> {
    let mut untrusted: Vec<&str> = Vec::new();
    for line in config.lines() {
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        let Some((name, _kind)) = key.strip_prefix("filter.").and_then(|k| k.rsplit_once('.'))
        else {
            continue;
        };
        if !TRUSTED_FILTERS.contains(&program(value)) && !untrusted.contains(&name) {
            untrusted.push(name);
        }
    }
    untrusted
        .into_iter()
        .flat_map(|name| {
            ["clean=", "smudge=", "process=", "required=false"]
                .map(|setting| ["-c".to_string(), format!("filter.{name}.{setting}")])
        })
        .flatten()
        .collect()
}

/// The program a filter command runs: its first word, unquoted (`"git-crypt" clean`).
fn program(command: &str) -> &str {
    let command = command.trim();
    match command.strip_prefix('"') {
        Some(rest) => rest.split('"').next().unwrap_or(""),
        None => command.split_whitespace().next().unwrap_or(""),
    }
}

/// Reado's own files inside the project: `.reado/` (local history, index,
/// bookmarks, reading progress) and the `.mcp.json` it writes to register its
/// MCP server with the agent.
///
/// They are never a change the user made, so no git-derived view may count them.
/// `.gitignore` was meant to cover this — the rest of the code says so out loud
/// ("gitignored like the rest of `.reado/`") — but the entry is only *offered*,
/// and only when the user creates their first comment, while `.reado/.history/`
/// starts filling on the first save. In that gap the Source Control view showed
/// 110 changes for a project with four, more than half of them Reado's own
/// snapshots, and a guided review planned a reading route over them.
fn is_reado_own(path: &str) -> bool {
    let p = path.trim_start_matches("./");
    p == ".mcp.json" || p == ".reado" || p.starts_with(".reado/")
}

/// Run git and return trimmed stdout, or `None` on failure.
pub(crate) fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    run_git_raw(root, args).map(|out| out.trim().to_string())
}

/// Run git and return raw stdout (no trimming), or `None` on failure.
fn run_git_raw(root: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = if let Some(options) = args.strip_prefix(&["diff"]) {
        let mut cmd = diff_command(root);
        cmd.args(options);
        cmd
    } else {
        let mut cmd = command("git");
        cmd.arg("-C").arg(root);
        if args.first().is_some_and(|sub| READS.contains(sub)) {
            cmd.args(filter_overrides(root));
        }
        cmd.args(args);
        cmd
    };
    // Background reads must not contend with the user's index lock.
    let output = cmd.env("GIT_OPTIONAL_LOCKS", "0").output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Distil git's failure output into the message that actually explains it.
///
/// `git pull` dumps the whole fetch ("From …", "<sha>..<sha> … -> origin/…",
/// "[new branch] …") to stderr even on success, so on failure that noise buries
/// the real reason — and a merge conflict reports on *stdout*, not stderr. We
/// merge both streams, drop the fetch chatter, and prefer the lines that name
/// the problem; only if none match do we fall back to everything that's left.
fn git_error_message(stdout: &str, stderr: &str) -> String {
    let is_fetch_noise = |l: &str| {
        l.starts_with("From ")
            || l.starts_with("remote:")
            || l.contains(" -> ")
            || l.contains("[new branch]")
            || l.contains("[new tag]")
            || l.contains("(use 'git remote prune'")
    };
    let is_real_error = |l: &str| {
        const KEYS: [&str; 10] = [
            "fatal:",
            "error:",
            "hint:",
            "CONFLICT",
            "Automatic merge failed",
            "Aborting",
            "Please ",
            "Not possible",
            "rejected",
            "overwritten",
        ];
        KEYS.iter().any(|k| l.contains(k))
    };
    let lines: Vec<&str> = stderr
        .lines()
        .chain(stdout.lines())
        .map(str::trim)
        .filter(|l| !l.is_empty() && !is_fetch_noise(l))
        .collect();
    let errs: Vec<&str> = lines.iter().copied().filter(|l| is_real_error(l)).collect();
    let chosen = if errs.is_empty() { &lines } else { &errs };
    let msg = chosen.join("\n");
    if msg.trim().is_empty() {
        "git command failed".to_string()
    } else {
        msg
    }
}

/// Run a mutating git command, surfacing the failure reason so the UI can show it.
pub(crate) fn run_git_checked(root: &str, args: &[&str]) -> Result<(), String> {
    run_git_checked_env(root, args, &[])
}

/// As [`run_git_checked`], with environment variables for the one git command
/// that needs them: an interactive rebase, which git insists on running through
/// an editor. Kept on the shared helper so that command still gets the same
/// error distillation and the same structured log as every other one.
fn run_git_checked_env(root: &str, args: &[&str], env: &[(&str, &str)]) -> Result<(), String> {
    let mut cmd = command("git");
    cmd.arg("-C").arg(root).args(args);
    for (key, value) in env {
        cmd.env(key, value);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    // Log only the git subcommand, never the full argv — callers pass free-form
    // values here (commit messages, branch/stash names) that must not be
    // persisted (the redactor keys on field names, not argv position).
    let op = args.first().copied().unwrap_or("");
    if output.status.success() {
        crate::log::info(
            "git",
            "git command ok",
            serde_json::json!({ "root": root, "op": op }),
        );
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = git_error_message(&stdout, &stderr);
        crate::log::error(
            "git",
            "git command failed",
            serde_json::json!({ "root": root, "op": op, "stderr": stderr.trim() }),
        );
        Err(message)
    }
}

#[cfg(test)]
mod test_support {
    use super::*;

    /// A throwaway repository with one commit, for the commands that can only be
    /// judged against a real one.
    pub(in crate::git) fn repo(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("reado-git-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().into_owned();
        for args in [
            vec!["init", "-q", "-b", "main"],
            vec!["config", "user.email", "t@example.com"],
            vec!["config", "user.name", "Test"],
            vec!["config", "commit.gpgsign", "false"],
        ] {
            run_git_checked(&root, &args).unwrap();
        }
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        run_git_checked(&root, &["commit", "-qm", "first"]).unwrap();
        dir
    }

    /// The subject lines of the history, newest first.
    pub(in crate::git) fn log(root: &str) -> Vec<String> {
        run_git(Path::new(root), &["log", "--format=%s"])
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn untrusted_filters_are_switched_off_and_trusted_tools_kept() {
        let config = "filter.lfs.clean git-lfs clean -- %f\n\
                      filter.lfs.process git-lfs filter-process\n\
                      filter.git-crypt.clean \"git-crypt\" clean\n\
                      filter.evil.clean sh -c 'touch pwned'\n\
                      filter.fake-lfs.process ./git-lfs filter-process\n";
        let overrides = untrusted_filter_overrides(config);
        assert!(overrides.contains(&"filter.evil.clean=".to_string()));
        assert!(overrides.contains(&"filter.evil.process=".to_string()));
        assert!(overrides.contains(&"filter.fake-lfs.required=false".to_string()));
        assert!(!overrides
            .iter()
            .any(|o| o.contains("filter.lfs.") || o.contains("git-crypt")));
        assert_eq!(overrides.len(), 2 * 8);
    }

    #[test]
    fn reads_do_not_run_a_repository_filter_but_writes_still_do() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let git = |args: &[&str]| {
            assert!(command("git")
                .arg("-C")
                .arg(root)
                .args(args)
                .status()
                .unwrap()
                .success())
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        std::fs::write(root.join(".gitattributes"), "*.txt filter=evil\n").unwrap();
        std::fs::write(root.join("f.txt"), "a\nb\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "init"]);
        git(&["config", "filter.evil.clean", "touch filter-ran; cat"]);
        git(&[
            "config",
            "filter.evil.process",
            "sh -c 'touch filter-ran; exit 1'",
        ]);
        std::fs::write(root.join("f.txt"), "a\nc\n").unwrap();
        let ran = root.join("filter-ran");

        assert!(run_git(root, &["status", "--porcelain"])
            .unwrap()
            .contains("f.txt"));
        assert!(!ran.exists(), "status ran the repository's filter");
        // The arguments Source Control and the badge really use, not a stand-in:
        // a leading `-c` there once hid status from the read check above.
        assert_eq!(status::status_entries(root).unwrap().len(), 1);
        assert!(!ran.exists(), "Source Control's status ran the filter");
        let diff = diff_command(root).arg("HEAD").output().unwrap();
        assert!(String::from_utf8_lossy(&diff.stdout).contains("+c"));
        assert!(!ran.exists(), "diff ran the repository's filter");

        // A write keeps the repository's filters: that's what they are for.
        run_git(root, &["add", "f.txt"]);
        assert!(ran.exists());
    }

    #[test]
    fn pull_error_drops_fetch_noise_and_keeps_reason() {
        // git pull: fetch chatter on stderr, the real reason buried among it.
        let stderr = "From github.com:acme/app\n   abb1a29..f378cec dev -> origin/dev\n * [new branch]      feature-x -> origin/feature-x\nhint: You have divergent branches and need to specify how to reconcile them.\nfatal: Need to specify how to reconcile divergent branches.";
        let msg = git_error_message("", stderr);
        assert!(msg.contains("divergent branches"), "got: {msg}");
        assert!(!msg.contains("[new branch]"), "fetch noise leaked: {msg}");
        assert!(!msg.contains("-> origin/"), "fetch noise leaked: {msg}");
    }

    #[test]
    fn merge_conflict_reason_comes_from_stdout() {
        // Conflicts report on stdout; stderr is just fetch noise here.
        let stdout = "Auto-merging src/a.rs\nCONFLICT (content): Merge conflict in src/a.rs\nAutomatic merge failed; fix conflicts and then commit the result.";
        let stderr = "From github.com:acme/app\n   1111..2222 dev -> origin/dev";
        let msg = git_error_message(stdout, stderr);
        assert!(msg.contains("CONFLICT"), "got: {msg}");
        assert!(msg.contains("Automatic merge failed"), "got: {msg}");
        assert!(!msg.contains("From github"), "fetch noise leaked: {msg}");
    }

    #[test]
    fn falls_back_to_remaining_output_when_no_keyword() {
        let msg = git_error_message("", "something unexpected happened");
        assert_eq!(msg, "something unexpected happened");
        assert_eq!(git_error_message("", "   \n  "), "git command failed");
    }
}
