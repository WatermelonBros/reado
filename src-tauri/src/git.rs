//! Lightweight git introspection.
//!
//! Reado treats git as the user's own tool and only reads from it. Rather than
//! link a native git library, we shell out to the `git` binary for the two facts
//! the MVP needs: whether a folder is a repository, and its current branch.
//! Git-dependent features degrade gracefully when `git` is absent.

use crate::proc::command;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;
use tauri::State;

/// Git status for an opened project.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Whether `root` is inside a git working tree.
    pub is_repo: bool,
    /// Current branch name, or `None` when detached / not a repo.
    pub branch: Option<String>,
}

fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = command("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// Project-relative paths changed for a guided-review scope. With no `base`,
/// the working-tree changes (tracked edits + untracked files) against HEAD; with
/// a `base` branch/ref, the files that differ on this branch (`base...HEAD`).
/// Used to seed a guided review's scope; never errors (empty on any failure).
#[tauri::command]
pub fn git_changed_files(root: String, base: Option<String>) -> Vec<String> {
    let root = Path::new(&root);
    let mut files: Vec<String> = Vec::new();
    let mut push = |s: Option<String>| {
        if let Some(out) = s {
            for line in out.lines() {
                let p = line.trim();
                if !p.is_empty() && !files.iter().any(|f| f == p) {
                    files.push(p.to_string());
                }
            }
        }
    };
    match base
        .as_deref()
        .map(str::trim)
        // Reject a base that would be read as a git option (`-`/`--…`) rather
        // than a revision — defence against argument injection.
        .filter(|b| !b.is_empty() && !b.starts_with('-'))
    {
        Some(base) => {
            // Branch scope: what this branch changed relative to its base.
            let range = format!("{base}...HEAD");
            push(run_git(root, &["diff", "--name-only", &range]));
        }
        None => {
            // Diff scope: the working tree vs HEAD, plus untracked files.
            push(run_git(root, &["diff", "--name-only", "HEAD"]));
            push(run_git(
                root,
                &["ls-files", "--others", "--exclude-standard"],
            ));
        }
    }
    files.sort();
    files
}

/// Inspect the git state of a project root. Never errors: a missing `git`, or a
/// non-repository folder, simply yields `is_repo: false`.
#[tauri::command]
pub fn git_info(root: String) -> GitInfo {
    let root = Path::new(&root);
    let is_repo = run_git(root, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    let branch = if is_repo {
        run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"]).filter(|b| !b.is_empty())
    } else {
        None
    };

    GitInfo { is_repo, branch }
}

/// Local and remote branches for the status-bar branch switcher.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranches {
    pub current: Option<String>,
    pub local: Vec<String>,
    pub remote: Vec<String>,
}

/// List local and remote branches, plus the current one.
#[tauri::command]
pub fn git_branches(root: String) -> GitBranches {
    let root = Path::new(&root);
    let current = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .filter(|b| !b.is_empty() && b != "HEAD");
    let parse = |out: Option<String>| -> Vec<String> {
        out.map(|s| {
            s.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default()
    };
    let local = parse(run_git(root, &["branch", "--format=%(refname:short)"]));
    // Drop the "origin/HEAD" symbolic pointer.
    let remote: Vec<String> = parse(run_git(
        root,
        &["branch", "-r", "--format=%(refname:short)"],
    ))
    .into_iter()
    .filter(|b| !b.ends_with("/HEAD"))
    .collect();
    GitBranches {
        current,
        local,
        remote,
    }
}

/// Check out a branch. For a remote branch ("origin/feat") the remote prefix is
/// stripped so git's DWIM creates a local tracking branch.
#[tauri::command]
pub fn git_checkout(root: String, branch: String, remote: bool) -> Result<(), String> {
    let target = if remote {
        branch
            .split_once('/')
            .map(|(_, b)| b.to_string())
            .unwrap_or_else(|| branch.clone())
    } else {
        branch.clone()
    };
    run_git_checked(&root, &["checkout", &target])
}

/// One changed file in the working tree, on one side (staged or unstaged). A
/// file modified both in the index and the working tree produces two entries.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Project-relative path (the new path for renames).
    pub path: String,
    /// Category: "modified" | "added" | "deleted" | "renamed" | "untracked".
    pub status: String,
    /// Whether this entry is in the index (staged) vs the working tree.
    pub staged: bool,
}

/// Map a single porcelain status char to a category.
fn categorize_char(c: char) -> &'static str {
    match c {
        'R' | 'C' => "renamed",
        'D' => "deleted",
        'A' => "added",
        '?' => "untracked",
        _ => "modified",
    }
}

/// Expand one `git status --porcelain` line into its staged/unstaged entries.
/// The two status chars are X (index) and Y (working tree); "MM path" yields
/// both a staged and an unstaged change, mirroring how SCM UIs present it.
fn expand_status_line(line: &str) -> Vec<GitChange> {
    if line.len() <= 3 {
        return Vec::new();
    }
    let bytes = line.as_bytes();
    let (x, y) = (bytes[0] as char, bytes[1] as char);
    let mut path = line[3..].to_string();
    // Renames are "old -> new"; keep the new path.
    if let Some(idx) = path.find(" -> ") {
        path = path[idx + 4..].to_string();
    }
    let path = path.trim_matches('"').to_string();

    if x == '?' {
        return vec![GitChange {
            path,
            status: "untracked".into(),
            staged: false,
        }];
    }
    let mut out = Vec::new();
    if x != ' ' {
        out.push(GitChange {
            path: path.clone(),
            status: categorize_char(x).into(),
            staged: true,
        });
    }
    if y != ' ' {
        out.push(GitChange {
            path,
            status: categorize_char(y).into(),
            staged: false,
        });
    }
    out
}

/// The working-tree status for the Source Control view, split into staged and
/// unstaged entries. (Raw, untrimmed output: porcelain lines begin with the
/// two status columns, so the leading space of an unstaged-only change matters.)
#[tauri::command]
pub fn git_status(root: String) -> Vec<GitChange> {
    // `-uall` lists individual untracked files instead of collapsing an
    // untracked directory to a single folder entry.
    let Some(out) = run_git_raw(Path::new(&root), &["status", "--porcelain", "-uall"]) else {
        return Vec::new();
    };
    out.lines().flat_map(expand_status_line).collect()
}

/// Run git and return raw stdout (no trimming), or `None` on failure.
fn run_git_raw(root: &Path, args: &[&str]) -> Option<String> {
    let output = command("git")
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
fn run_git_checked(root: &str, args: &[&str]) -> Result<(), String> {
    let output = command("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
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

/// Stage a path (`git add`). Also stages a deletion.
#[tauri::command]
pub fn git_stage(root: String, path: String) -> Result<(), String> {
    run_git_checked(&root, &["add", "--", &path])
}

/// Unstage a path (`git reset HEAD`).
#[tauri::command]
pub fn git_unstage(root: String, path: String) -> Result<(), String> {
    run_git_checked(&root, &["reset", "-q", "HEAD", "--", &path])
}

/// Stage every change (`git add -A`).
#[tauri::command]
pub fn git_stage_all(root: String) -> Result<(), String> {
    run_git_checked(&root, &["add", "-A"])
}

/// Unstage everything (`git reset HEAD`).
#[tauri::command]
pub fn git_unstage_all(root: String) -> Result<(), String> {
    run_git_checked(&root, &["reset", "-q", "HEAD"])
}

/// Discard working-tree changes for a path. For an untracked file this deletes
/// it; for a tracked file it restores it to HEAD. Destructive — the caller must
/// confirm with the user first.
#[tauri::command]
pub fn git_discard(root: String, path: String, untracked: bool) -> Result<(), String> {
    if untracked {
        let full = Path::new(&root).join(&path);
        if full.is_dir() {
            std::fs::remove_dir_all(&full).map_err(|e| e.to_string())
        } else {
            std::fs::remove_file(&full).map_err(|e| e.to_string())
        }
    } else {
        run_git_checked(&root, &["checkout", "--", &path])
    }
}

/// Commit the staged changes with a message (`git commit -m`).
#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Empty commit message".into());
    }
    run_git_checked(&root, &["commit", "-m", &message])
}

/// Discard working-tree changes in bulk. Always restores tracked files to the
/// index (`checkout -- .`); when `untracked` is set, also removes untracked
/// files and directories (`clean -fd`). Destructive — confirm first.
#[tauri::command]
pub fn git_discard_all(root: String, untracked: bool) -> Result<(), String> {
    run_git_checked(&root, &["checkout", "--", "."])?;
    if untracked {
        run_git_checked(&root, &["clean", "-fd"])?;
    }
    Ok(())
}

/// Create and switch to a new branch (`git checkout -b`).
#[tauri::command]
pub fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Empty branch name".into());
    }
    run_git_checked(&root, &["checkout", "-b", name])
}

/// Fetch all remotes and prune deleted remote branches.
#[tauri::command]
pub fn git_fetch(root: String) -> Result<(), String> {
    run_git_checked(&root, &["fetch", "--all", "--prune"])
}

/// Pull the current branch from its upstream.
#[tauri::command]
pub fn git_pull(root: String) -> Result<(), String> {
    run_git_checked(&root, &["pull"])
}

/// Push the current branch, setting upstream to origin if not already tracked
/// (so a brand-new branch is published in one step).
#[tauri::command]
pub fn git_push(root: String) -> Result<(), String> {
    run_git_checked(&root, &["push", "-u", "origin", "HEAD"])
}

/// One saved stash entry.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    /// Index into the stash stack (0 = most recent).
    pub index: u32,
    /// Human-readable description (the part after `stash@{N}:`).
    pub message: String,
}

/// List saved stashes (most recent first).
#[tauri::command]
pub fn git_stash_list(root: String) -> Vec<StashEntry> {
    let Some(out) = run_git_raw(Path::new(&root), &["stash", "list"]) else {
        return Vec::new();
    };
    out.lines()
        .enumerate()
        .map(|(i, line)| StashEntry {
            index: i as u32,
            message: line
                .split_once(": ")
                .map(|(_, m)| m.to_string())
                .unwrap_or_else(|| line.to_string()),
        })
        .collect()
}

/// Stash the working-tree changes (optionally including untracked files).
#[tauri::command]
pub fn git_stash(root: String, message: Option<String>, untracked: bool) -> Result<(), String> {
    let mut args = vec!["stash", "push"];
    if untracked {
        args.push("--include-untracked");
    }
    let msg = message.unwrap_or_default();
    if !msg.trim().is_empty() {
        args.push("-m");
        args.push(&msg);
    }
    run_git_checked(&root, &args)
}

/// Apply a stash and drop it (`git stash pop stash@{index}`).
#[tauri::command]
pub fn git_stash_pop(root: String, index: u32) -> Result<(), String> {
    run_git_checked(&root, &["stash", "pop", &format!("stash@{{{index}}}")])
}

/// Apply a stash, keeping it in the stack (`git stash apply`).
#[tauri::command]
pub fn git_stash_apply(root: String, index: u32) -> Result<(), String> {
    run_git_checked(&root, &["stash", "apply", &format!("stash@{{{index}}}")])
}

/// Delete a stash without applying it (`git stash drop`).
#[tauri::command]
pub fn git_stash_drop(root: String, index: u32) -> Result<(), String> {
    run_git_checked(&root, &["stash", "drop", &format!("stash@{{{index}}}")])
}

/// Blame attribution for one line of a file.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    /// 1-based final line number.
    pub line: u32,
    /// Abbreviated commit hash (8 chars); all-zero for not-yet-committed lines.
    pub hash: String,
    pub author: String,
    /// Author time as a Unix timestamp (seconds).
    pub time: i64,
    /// First line of the commit message.
    pub summary: String,
}

/// A cached blame result, valid while the file's HEAD and mtime are unchanged.
struct CachedBlame {
    head: String,
    mtime: Option<SystemTime>,
    lines: Vec<BlameLine>,
}

/// Per-(root, file) blame cache so toggling blame on/off or re-opening a file
/// doesn't re-run `git blame`; an entry is invalidated when HEAD or the file's
/// mtime changes.
#[derive(Default)]
pub struct BlameCache(Mutex<HashMap<String, CachedBlame>>);

/// Per-line blame for a tracked file (`git blame --line-porcelain`). Returns an
/// empty list when git is unavailable or the file is untracked. Lazy: only the
/// frontend (blame mode on) calls it, and results are cached per (file, HEAD).
#[tauri::command]
pub fn git_blame(cache: State<BlameCache>, root: String, file: String) -> Vec<BlameLine> {
    let key = format!("{root}\u{0}{file}");
    let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap_or_default();
    let mtime = std::fs::metadata(Path::new(&root).join(&file))
        .and_then(|m| m.modified())
        .ok();

    // Cache hit: same HEAD and same file mtime → reuse.
    if let Ok(map) = cache.0.lock() {
        if let Some(hit) = map.get(&key) {
            if hit.head == head && hit.mtime == mtime {
                return hit.lines.clone();
            }
        }
    }

    let Some(out) = run_git_raw(
        Path::new(&root),
        &["blame", "--line-porcelain", "--", &file],
    ) else {
        return Vec::new();
    };

    let mut lines = Vec::new();
    let (mut hash, mut author, mut summary) = (String::new(), String::new(), String::new());
    let (mut time, mut final_line) = (0i64, 0u32);
    for l in out.lines() {
        if let Some(content) = l.strip_prefix('\t') {
            let _ = content; // the source line itself is not needed
            lines.push(BlameLine {
                line: final_line,
                hash: hash.chars().take(8).collect(),
                author: author.clone(),
                time,
                summary: summary.clone(),
            });
        } else if let Some(rest) = l.strip_prefix("author ") {
            author = rest.to_string();
        } else if let Some(rest) = l.strip_prefix("author-time ") {
            time = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = l.strip_prefix("summary ") {
            summary = rest.to_string();
        } else {
            // Commit header: "<40-hex-hash> <orig-line> <final-line> [count]".
            let mut it = l.split(' ');
            if let Some(h) = it.next() {
                if h.len() >= 8 && h.bytes().all(|b| b.is_ascii_hexdigit()) {
                    hash = h.to_string();
                    it.next(); // original line
                    if let Some(fl) = it.next() {
                        final_line = fl.parse().unwrap_or(final_line);
                    }
                }
            }
        }
    }

    if let Ok(mut map) = cache.0.lock() {
        map.insert(
            key,
            CachedBlame {
                head,
                mtime,
                lines: lines.clone(),
            },
        );
    }
    lines
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

    #[test]
    fn categorizes_status_chars() {
        assert_eq!(categorize_char('?'), "untracked");
        assert_eq!(categorize_char('M'), "modified");
        assert_eq!(categorize_char('A'), "added");
        assert_eq!(categorize_char('D'), "deleted");
        assert_eq!(categorize_char('R'), "renamed");
    }

    #[test]
    fn expands_status_lines() {
        let unstaged = expand_status_line(" M src/main.rs");
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0].path, "src/main.rs");
        assert_eq!(unstaged[0].status, "modified");
        assert!(!unstaged[0].staged);

        let staged = expand_status_line("A  new.rs");
        assert_eq!(staged.len(), 1);
        assert!(staged[0].staged);
        assert_eq!(staged[0].status, "added");

        // Both index and working tree changed → two entries.
        let both = expand_status_line("MM both.rs");
        assert_eq!(both.len(), 2);
        assert!(both[0].staged && !both[1].staged);

        let rename = expand_status_line("R  old.rs -> new.rs");
        assert_eq!(rename[0].path, "new.rs");
        assert_eq!(rename[0].status, "renamed");
        assert!(rename[0].staged);

        let untracked = expand_status_line("?? \"weird name.rs\"");
        assert_eq!(untracked[0].path, "weird name.rs");
        assert_eq!(untracked[0].status, "untracked");
        assert!(!untracked[0].staged);

        assert!(expand_status_line("").is_empty());
    }
}

/// The diff bases the user can compare against: local branches and recent commits.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRefs {
    pub branches: Vec<String>,
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub subject: String,
}

/// List local branches and the most recent commits, for the diff base picker.
#[tauri::command]
pub fn git_refs(root: String) -> GitRefs {
    let root = Path::new(&root);
    let branches = run_git(
        root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .map(|s| s.lines().map(str::to_string).collect())
    .unwrap_or_default();
    let commits = run_git(root, &["log", "-25", "--format=%h%x09%s"])
        .map(|s| {
            s.lines()
                .filter_map(|l| l.split_once('\t'))
                .map(|(h, s)| GitCommit {
                    hash: h.to_string(),
                    subject: s.to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    GitRefs { branches, commits }
}

/// The current HEAD commit hash (short), or None outside a repo. Used for cheap
/// "has the repo moved since X" freshness checks (e.g. repo onboarding).
#[tauri::command]
pub fn git_head(root: String) -> Option<String> {
    run_git(Path::new(&root), &["rev-parse", "--short", "HEAD"]).filter(|h| !h.is_empty())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCommit {
    pub hash: String,
    pub author: String,
    /// Commit (author) time as a Unix timestamp (seconds).
    pub time: i64,
    pub subject: String,
}

/// The commits that touched a file (most recent first), following renames, for
/// the Timeline panel. Empty when git is unavailable or the file is untracked.
#[tauri::command]
pub fn git_file_history(root: String, file: String) -> Vec<FileCommit> {
    // Unit-separator-delimited fields, one commit per line.
    let fmt = "--format=%H%x1f%an%x1f%at%x1f%s";
    let Some(out) = run_git_raw(Path::new(&root), &["log", "--follow", fmt, "--", &file]) else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|l| {
            let mut it = l.split('\u{1f}');
            let hash = it.next()?;
            let author = it.next().unwrap_or("");
            let time = it.next().and_then(|t| t.parse().ok()).unwrap_or(0);
            let subject = it.next().unwrap_or("");
            Some(FileCommit {
                hash: hash.chars().take(8).collect(),
                author: author.to_string(),
                time,
                subject: subject.to_string(),
            })
        })
        .collect()
}

/// The contents of a tracked file at a given ref (a branch, commit, or `HEAD`),
/// for the on-demand diff view. Returns `None` when the file is absent there or
/// git is unavailable. Output is verbatim (no trimming) so the diff is exact.
#[tauri::command]
pub fn git_show_ref(root: String, file: String, base: String) -> Option<String> {
    let reference = if base.is_empty() { "HEAD" } else { &base };
    // `git show <ref>:<path>` expects forward slashes, which is what we store.
    let output = command("git")
        .arg("-C")
        .arg(&root)
        .args(["show", &format!("{reference}:{file}")])
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}
