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
mod graph;
mod hunk;
mod remote;
mod rewrite;
mod signing;
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
pub use stash::*;
pub use status::*;
pub use worktree::*;

use crate::proc::command;
use std::path::Path;

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
    let output = command("git")
        // Reado polls `status`/`info` in the background. Without this, each poll
        // may take `index.lock` to refresh the index — colliding with the git the
        // user is running in the terminal (either side then fails), and with the
        // other poll now that these commands run off the UI thread.
        .arg("--no-optional-locks")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
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
