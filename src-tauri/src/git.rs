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

use serde::{Deserialize, Serialize};
use tauri::State;

/// Git status for an opened project.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Whether `root` is inside a git working tree.
    pub is_repo: bool,
    /// Current branch name, or `None` when detached / not a repo.
    pub branch: Option<String>,
    /// Commits on HEAD not yet on the upstream (how many to push). 0 with no
    /// upstream.
    pub ahead: u32,
    /// Commits on the upstream not yet on HEAD (how many to pull). 0 with no
    /// upstream.
    pub behind: u32,
    /// Whether any remote is configured (so fetch/pull/sync can do anything).
    pub has_remote: bool,
    /// Whether the current branch tracks an upstream (so ahead/behind are
    /// meaningful; a branch with a remote but no upstream can still be published
    /// by a first push).
    pub has_upstream: bool,
    /// Files with working-tree or index changes, for the Source Control badge.
    pub changed_files: u32,
}

/// Working-tree status, one line per path. `-uall` lists individual untracked
/// files instead of collapsing an untracked directory to a single folder entry;
/// `-c core.quotepath=false` stops git octal-escaping non-ASCII bytes (e.g.
/// `na\303\257ve.rs`), so the paths match the real files on disk.
const STATUS_ARGS: [&str; 5] = [
    "-c",
    "core.quotepath=false",
    "status",
    "--porcelain",
    "-uall",
];

/// Run git and return trimmed stdout, or `None` on failure.
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

fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    run_git_raw(root, args).map(|out| out.trim().to_string())
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
                if !p.is_empty() && !is_reado_own(p) && !files.iter().any(|f| f == p) {
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
/// `async` so it runs on a worker: it shells out to git several times, the UI
/// polls it, and a slow repo answering on the main thread freezes the window.
#[tauri::command(async)]
pub fn git_info(root: String) -> GitInfo {
    let root = Path::new(&root);
    let is_repo = run_git(root, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    let branch = if is_repo {
        // A detached HEAD yields the literal "HEAD"; report it as `None` (no
        // branch), matching git_branches and the documented contract.
        run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .filter(|b| !b.is_empty() && b != "HEAD")
    } else {
        None
    };

    let has_remote = is_repo
        && run_git(root, &["remote"])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

    // ahead/behind vs the tracking branch. `rev-list --left-right --count
    // @{upstream}...HEAD` prints "<behind>\t<ahead>"; it fails (→ None) when the
    // branch has no upstream, which is how we detect `has_upstream`.
    let (behind, ahead, has_upstream) = is_repo
        .then(|| {
            run_git(
                root,
                &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
            )
        })
        .flatten()
        .map(|counts| {
            let (behind, ahead) = parse_left_right(&counts);
            (behind, ahead, true)
        })
        .unwrap_or((0, 0, false));

    // One porcelain line per path (a rename is still one line), so counting
    // lines counts *files* — staged and unstaged edits to the same file must
    // not badge as two.
    let changed_files = is_repo
        .then(|| run_git_raw(root, &STATUS_ARGS))
        .flatten()
        .map(|out| {
            out.lines()
                .filter(|l| !is_reado_own(&status_line_path(l)))
                .count() as u32
        })
        .unwrap_or(0);

    GitInfo {
        is_repo,
        branch,
        ahead,
        behind,
        has_remote,
        has_upstream,
        changed_files,
    }
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
/// The path a porcelain status line names — rename target, unquoted — or empty
/// for a line too short to carry one. Shared so the badge count and the change
/// list read the same path out of the same line.
fn status_line_path(line: &str) -> String {
    if line.len() <= 3 {
        return String::new();
    }
    let mut path = line[3..].to_string();
    // Renames are "old -> new"; keep the new path.
    if let Some(idx) = path.find(" -> ") {
        path = path[idx + 4..].to_string();
    }
    path.trim_matches('"').to_string()
}

fn expand_status_line(line: &str) -> Vec<GitChange> {
    if line.len() <= 3 {
        return Vec::new();
    }
    let bytes = line.as_bytes();
    let (x, y) = (bytes[0] as char, bytes[1] as char);
    let path = status_line_path(line);

    if x == '?' {
        return vec![GitChange {
            path,
            status: "untracked".into(),
            staged: false,
        }];
    }
    // Unmerged (merge-conflict) states — `U` on either side, or `AA`/`DD`. These
    // must not be split into a staged "modified" entry (which reads as "resolved
    // and staged"); surface a single `conflicted` entry instead.
    if matches!((x, y), ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')) {
        return vec![GitChange {
            path,
            status: "conflicted".into(),
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
/// `async` for the same reason as `git_info`: polled, and slow on a big tree.
#[tauri::command(async)]
pub fn git_status(root: String) -> Vec<GitChange> {
    let Some(out) = run_git_raw(Path::new(&root), &STATUS_ARGS) else {
        return Vec::new();
    };
    out.lines()
        .flat_map(expand_status_line)
        .filter(|c| !is_reado_own(&c.path))
        .collect()
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
fn run_git_checked(root: &str, args: &[&str]) -> Result<(), String> {
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
        // Confine the deletion to the project root: an untracked `path` that
        // escapes (`../…`) or is absolute must never let remove_dir_all wipe
        // files outside the repo. Reuse the same confinement guard as fs.rs.
        let full = Path::new(&root).join(&path);
        let full = crate::fs::ensure_within(Path::new(&root), &full).map_err(|e| e.to_string())?;
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

/// Outcome of a sync (pull + push).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    /// Files left conflicted by the pull. Non-empty means the merge stopped and
    /// the push was skipped: the user must resolve these and commit before
    /// syncing again. Empty means the sync completed cleanly.
    pub conflicted: Vec<String>,
}

/// Sync the current branch: pull, then push (VS Code's "Synchronize Changes").
///
/// A merge conflict during the pull is not an error — it's an expected outcome we
/// report by returning the conflicted files so the UI can point the user at them.
/// The push is skipped in that case (there's nothing safe to push mid-conflict).
/// Any other pull failure (no upstream, network, unrelated histories) propagates
/// as `Err` with git's own reason.
#[tauri::command]
pub fn git_sync(root: String) -> Result<SyncOutcome, String> {
    let pull = run_git_checked(&root, &["pull"]);
    if pull.is_err() {
        // Distinguish a conflict (recoverable, surface the files) from a real
        // failure (propagate). A conflict leaves `conflicted` entries in status.
        let conflicted = conflicted_files(&root);
        if !conflicted.is_empty() {
            return Ok(SyncOutcome { conflicted });
        }
        pull?;
    }
    run_git_checked(&root, &["push", "-u", "origin", "HEAD"])?;
    Ok(SyncOutcome {
        conflicted: Vec::new(),
    })
}

/// Parse `git rev-list --left-right --count @{u}...HEAD` output ("<behind>\t<ahead>")
/// into `(behind, ahead)`. Left = upstream-only commits (to pull), right =
/// HEAD-only commits (to push). Missing/garbage fields fall back to 0.
fn parse_left_right(counts: &str) -> (u32, u32) {
    let mut it = counts.split_whitespace();
    let behind = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (behind, ahead)
}

/// Project-relative paths currently in a merge-conflict state.
fn conflicted_files(root: &str) -> Vec<String> {
    git_status(root.to_string())
        .into_iter()
        .filter(|c| c.status == "conflicted")
        .map(|c| c.path)
        .collect()
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

/// Cap the blame cache so it can't grow unbounded across a long session over
/// many files (each entry holds one BlameLine per source line).
const BLAME_CACHE_MAX: usize = 64;

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

    let lines = parse_blame_porcelain(&out);

    if let Ok(mut map) = cache.0.lock() {
        // ponytail: clear-all eviction at the cap — blame recomputes lazily on the
        // next request. A real LRU only if blame churn ever proves it matters.
        if map.len() >= BLAME_CACHE_MAX {
            map.clear();
        }
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

/// De-serialise `git blame --line-porcelain` into one `BlameLine` per source
/// line. The porcelain groups each line as: a commit header
/// `"<40-hex-hash> <orig-line> <final-line> [count]"`, then `author`,
/// `author-time`, `summary` (and other) fields, terminated by the `\t<content>`
/// line — that terminator is what emits a `BlameLine`. Header fields carry
/// forward across lines that share a commit (git omits them after the first).
/// The hash is abbreviated to 8 chars; a header whose first token isn't ≥8 hex
/// digits is ignored, keeping the previous commit's fields. Pure so it can be
/// unit-tested without spawning git.
fn parse_blame_porcelain(out: &str) -> Vec<BlameLine> {
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
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A throwaway repository with one commit, for the commands that can only be
    /// judged against a real one.
    fn repo(name: &str) -> std::path::PathBuf {
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

    #[test]
    fn reados_own_files_never_count_as_the_users_changes() {
        let dir = repo("reado-own");
        let root = dir.to_string_lossy().into_owned();
        // What the user did.
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        std::fs::write(dir.join("new.txt"), "mine\n").unwrap();
        // What Reado did to the same project, unasked: local history snapshots
        // and the MCP registration. `.gitignore` is not offered until the first
        // comment, so without a filter these land in every git-derived view —
        // 110 "changes" for a project with two.
        std::fs::create_dir_all(dir.join(".reado/.history/a.txt")).unwrap();
        std::fs::write(
            dir.join(".reado/.history/a.txt/1789780987010143000"),
            "one\n",
        )
        .unwrap();
        std::fs::write(dir.join(".reado/bookmarks.json"), "[]\n").unwrap();
        std::fs::write(dir.join(".mcp.json"), "{}\n").unwrap();

        let paths: Vec<String> = git_status(root.clone())
            .into_iter()
            .map(|c| c.path)
            .collect();
        assert!(paths.contains(&"a.txt".to_string()), "{paths:?}");
        assert!(paths.contains(&"new.txt".to_string()), "{paths:?}");
        assert!(
            !paths
                .iter()
                .any(|p| p.starts_with(".reado") || p == ".mcp.json"),
            "Reado's own files reached the Source Control view: {paths:?}"
        );

        let scope = git_changed_files(root.clone(), None);
        assert!(
            !scope
                .iter()
                .any(|p| p.starts_with(".reado") || p == ".mcp.json"),
            "Reado's own files reached a review scope: {scope:?}"
        );

        // …and the badge counts the same two files the list shows.
        assert_eq!(git_info(root).changed_files, 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The subject lines of the history, newest first.
    fn log(root: &str) -> Vec<String> {
        run_git(Path::new(root), &["log", "--format=%s"])
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn amend_rewrites_the_last_commit_rather_than_adding_one() {
        let dir = repo("amend");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("b.txt"), "two\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        git_amend(root.clone(), Some("first, properly".into())).unwrap();
        assert_eq!(log(&root), vec!["first, properly"]);
        // The forgotten file is part of that one commit now.
        let files = run_git(
            Path::new(&root),
            &["show", "--name-only", "--format=", "HEAD"],
        )
        .unwrap();
        assert!(files.contains("b.txt"), "got: {files}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn amend_with_no_message_keeps_the_one_it_had() {
        let dir = repo("amend-nomsg");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("b.txt"), "two\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        git_amend(root.clone(), None).unwrap();
        assert_eq!(log(&root), vec!["first"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_commit_that_never_left_is_not_reported_as_pushed() {
        let dir = repo("pushed");
        let root = dir.to_string_lossy().into_owned();
        assert!(!git_head_is_pushed(root));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn revert_undoes_a_commit_and_leaves_it_in_the_history() {
        let dir = repo("revert");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "second"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        let out = git_revert(root.clone(), head.trim().into()).unwrap();
        assert!(out.conflicted.is_empty());
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "one\n");
        // Three entries: the revert is a new commit, not a rewrite.
        assert_eq!(log(&root).len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_revert_that_conflicts_reports_the_files_rather_than_claiming_success() {
        let dir = repo("revert-conflict");
        let root = dir.to_string_lossy().into_owned();
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "second"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        // Move the same line again, so undoing the middle commit cannot apply.
        std::fs::write(dir.join("a.txt"), "three\n").unwrap();
        run_git_checked(&root, &["commit", "-aqm", "third"]).unwrap();
        let out = git_revert(root.clone(), head.trim().into()).unwrap();
        assert_eq!(out.conflicted, vec!["a.txt".to_string()]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cherry_pick_brings_one_commit_across() {
        let dir = repo("cherry");
        let root = dir.to_string_lossy().into_owned();
        run_git_checked(&root, &["checkout", "-qb", "side"]).unwrap();
        std::fs::write(dir.join("c.txt"), "from side\n").unwrap();
        run_git_checked(&root, &["add", "."]).unwrap();
        run_git_checked(&root, &["commit", "-qm", "side work"]).unwrap();
        let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap();
        run_git_checked(&root, &["checkout", "-q", "main"]).unwrap();
        assert!(!dir.join("c.txt").exists());
        let out = git_cherry_pick(root.clone(), head.trim().into()).unwrap();
        assert!(out.conflicted.is_empty());
        assert!(dir.join("c.txt").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tags_are_listed_created_and_deleted() {
        let dir = repo("tags");
        let root = dir.to_string_lossy().into_owned();
        assert!(git_tags(root.clone()).is_empty());
        git_tag_create(root.clone(), "v1.0.0".into(), Some("first release".into())).unwrap();
        assert_eq!(git_tags(root.clone()), vec!["v1.0.0".to_string()]);
        // A name already taken is refused rather than silently moved.
        assert!(git_tag_create(root.clone(), "v1.0.0".into(), None).is_err());
        git_tag_delete(root.clone(), "v1.0.0".into()).unwrap();
        assert!(git_tags(root).is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_empty_tag_name_is_refused_before_git_sees_it() {
        let dir = repo("tag-empty");
        let root = dir.to_string_lossy().into_owned();
        assert!(git_tag_create(root, "   ".into(), None).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn remotes_are_listed_once_each_added_renamed_and_removed() {
        let dir = repo("remotes");
        let root = dir.to_string_lossy().into_owned();
        assert!(git_remotes(root.clone()).is_empty());
        git_remote_add(
            root.clone(),
            "origin".into(),
            "https://example.com/x.git".into(),
        )
        .unwrap();
        let listed = git_remotes(root.clone());
        // `remote -v` prints fetch and push rows for the same remote.
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "origin");
        assert_eq!(listed[0].url, "https://example.com/x.git");
        git_remote_remove(root.clone(), "origin".into()).unwrap();
        assert!(git_remotes(root).is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_remote_needs_both_a_name_and_a_url() {
        let dir = repo("remote-empty");
        let root = dir.to_string_lossy().into_owned();
        assert!(git_remote_add(root, "origin".into(), "  ".into()).is_err());
        std::fs::remove_dir_all(&dir).ok();
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
    fn left_right_counts_are_behind_then_ahead() {
        // git prints "<behind>\t<ahead>": 2 to pull, 3 to push.
        assert_eq!(parse_left_right("2\t3"), (2, 3));
        // Space-separated works too; up-to-date is (0, 0).
        assert_eq!(parse_left_right("0 0"), (0, 0));
        // Garbage / empty degrades to zeros rather than panicking.
        assert_eq!(parse_left_right(""), (0, 0));
        assert_eq!(parse_left_right("x"), (0, 0));
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

        // Unmerged (conflict) states collapse to a single `conflicted` entry,
        // never a staged "modified" one.
        let conflict = expand_status_line("UU both.rs");
        assert_eq!(conflict.len(), 1);
        assert_eq!(conflict[0].status, "conflicted");
        assert!(!conflict[0].staged);
        assert_eq!(expand_status_line("AA x.rs")[0].status, "conflicted");
        assert_eq!(expand_status_line("DU y.rs")[0].status, "conflicted");

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

    #[test]
    fn parses_diff_hunk_headers() {
        // Added block: start 5, count 3 → [5, 7].
        assert_eq!(parse_diff_hunks("@@ -1,0 +5,3 @@"), vec![[5, 7]]);
        // Omitted count defaults to 1: `+2` → [2, 2].
        assert_eq!(parse_diff_hunks("@@ -1 +2 @@"), vec![[2, 2]]);
        // Pure deletion (count 0 on the head side) is skipped.
        assert!(parse_diff_hunks("@@ -3,2 +4,0 @@").is_empty());

        // Multiple hunks in one diff body, interleaved with content lines.
        let diff = "\
diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,0 +5,3 @@
+added
+added
+added
@@ -10,1 +20,1 @@ fn ctx()
-old
+new
@@ -30,2 +40,0 @@
-gone
-gone";
        assert_eq!(parse_diff_hunks(diff), vec![[5, 7], [20, 20]]);

        // Malformed headers are ignored: no `@@` prefix, no `+` token, and a
        // non-numeric start all yield nothing.
        assert!(parse_diff_hunks("not a hunk header").is_empty());
        assert!(parse_diff_hunks("@@ -1,2 nope @@").is_empty());
        assert!(parse_diff_hunks("@@ -1 +abc @@").is_empty());
    }

    #[test]
    fn parses_blame_porcelain() {
        // Two source lines, both from one commit: the header + author/
        // author-time/summary fields appear once, then each `\t<content>` line
        // terminates a BlameLine (git omits the repeated fields for line 2, so
        // they must carry forward).
        let out = "\
0a1b2c3d4e5f60718293a4b5c6d7e8f901234567 1 1 2
author Ada Lovelace
author-mail <ada@example.com>
author-time 1700000000
author-tz +0000
summary Add the analytical engine
filename src/engine.rs
\tfirst line of content
0a1b2c3d4e5f60718293a4b5c6d7e8f901234567 2 2
\tsecond line of content";
        let lines = parse_blame_porcelain(out);
        assert_eq!(lines.len(), 2);

        assert_eq!(lines[0].hash, "0a1b2c3d");
        assert_eq!(lines[0].hash.len(), 8);
        assert_eq!(lines[0].author, "Ada Lovelace");
        assert_eq!(lines[0].time, 1_700_000_000);
        assert_eq!(lines[0].summary, "Add the analytical engine");
        assert_eq!(lines[0].line, 1);

        // Line 2 reuses the carried-forward commit fields, with its own line no.
        assert_eq!(lines[1].hash, "0a1b2c3d");
        assert_eq!(lines[1].author, "Ada Lovelace");
        assert_eq!(lines[1].time, 1_700_000_000);
        assert_eq!(lines[1].summary, "Add the analytical engine");
        assert_eq!(lines[1].line, 2);
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
    let Some(out) = run_git_raw(
        Path::new(&root),
        &["log", "--follow", "--max-count=200", fmt, "--", &file],
    ) else {
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
///
/// "Absent" and "no such ref" are the same answer here on purpose: a caller that
/// wants the file's *bytes* at a ref (the PR reader) falls back to the working
/// tree either way. A caller that wants a document to *diff against* wants
/// `git_diff_base` instead.
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
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The document to diff a file against at `base` — a different question from
/// "what are this file's bytes there", and it needs a different answer:
///
///   - `Some(text)` — the file is in that commit.
///   - `Some("")`   — the commit is fine but the file isn't in it. The file was
///                    added since the base, so its base is an empty document and
///                    the diff reads as all-added. A new file deserves a green
///                    diff, not "no base to compare against".
///   - `None`       — the ref itself doesn't resolve (not a repo, no commits, a
///                    base that no longer exists). Only then is there genuinely
///                    nothing to diff against.
#[tauri::command]
pub fn git_diff_base(root: String, file: String, base: String) -> Option<String> {
    let reference = if base.is_empty() {
        "HEAD"
    } else {
        base.as_str()
    };
    let exists = ref_exists(Path::new(&root), reference);
    git_show_ref(root, file, base).or_else(|| exists.then(String::new))
}

/// Whether `reference` resolves to a commit in this repository.
fn ref_exists(root: &Path, reference: &str) -> bool {
    run_git_raw(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{reference}^{{commit}}"),
        ],
    )
    .is_some()
}

/// Line ranges the working tree changes relative to HEAD, for the diff gutter.
///
/// Distinct from `git_diff_lines`, which compares two refs: the gutter is about
/// what *you* have touched and not committed, so the right-hand side is the file
/// on disk, not another commit. Ranges are 1-based and inclusive, on the working
/// copy's numbering, which is what the editor is showing.
#[tauri::command]
pub fn git_working_diff_lines(root: String, file: String) -> Vec<[u32; 2]> {
    let output = match command("git")
        .arg("-C")
        .arg(&root)
        // `HEAD` (not `--cached`) so both staged and unstaged edits are marked:
        // the gutter answers "is this line different from the last commit".
        .args(["diff", "--unified=0", "HEAD", "--", &file])
        .output()
    {
        Ok(o) if o.status.success() => o,
        // Not a repo, or a file git has never seen — no marks, not an error.
        _ => return Vec::new(),
    };
    parse_diff_hunks(&String::from_utf8_lossy(&output.stdout))
}

/// The line ranges a file gained or changed between two refs (`base...head`,
/// merge-base semantics — a PR's own changes). Each `[start, end]` is 1-based and
/// inclusive on the *head* side, for inline change markers in the reader. Empty
/// on any failure. Pure deletions (no head lines) are omitted.
#[tauri::command]
pub fn git_diff_lines(root: String, file: String, base: String, head: String) -> Vec<[u32; 2]> {
    let range = format!("{base}...{head}");
    let output = match command("git")
        .arg("-C")
        .arg(&root)
        .args(["diff", "--unified=0", &range, "--", &file])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let text = String::from_utf8_lossy(&output.stdout);
    parse_diff_hunks(&text)
}

/// Parse the head-side changed-line ranges out of a `git diff --unified=0` body.
/// Reads each unified-diff hunk header `@@ -a,b +c,d @@ …` and keeps the `+c,d`
/// (head) side: `[start, start + count - 1]`, 1-based and inclusive. A missing
/// count defaults to 1 (`@@ -1 +2 @@` → `[2, 2]`); a zero count is a pure
/// deletion and is skipped; malformed headers are ignored. Pure so it can be
/// unit-tested without spawning git.
fn parse_diff_hunks(diff: &str) -> Vec<[u32; 2]> {
    let mut ranges = Vec::new();
    for line in diff.lines() {
        // Hunk header: `@@ -a,b +c,d @@ …`. The `+c,d` is the head-side range.
        let Some(rest) = line.strip_prefix("@@") else {
            continue;
        };
        let Some(plus) = rest.split_whitespace().find(|t| t.starts_with('+')) else {
            continue;
        };
        let mut nums = plus[1..].split(',');
        let Some(start) = nums.next().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        let count = nums.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(1);
        if count == 0 {
            continue; // a pure deletion — nothing to mark on the head side
        }
        ranges.push([start, start + count - 1]);
    }
    ranges
}

// ---- Review-grade git: per-hunk staging and conflict resolution -------------
//
// Staging a whole file is the wrong granularity for review: a working tree
// usually holds one change you want to commit and three you don't. These commands
// operate on a single hunk by feeding `git apply` a patch containing only that
// hunk — which is exactly what `git add -p` does, without the interactive prompt.

/// One hunk of a file's diff, with a patch that applies just it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    /// Position in the file's diff, for stable identity across a refresh.
    pub index: usize,
    /// The `@@ … @@` line, for a compact label.
    pub header: String,
    /// A complete patch applying only this hunk (file headers + the hunk).
    pub patch: String,
    /// First line the hunk touches on the working-tree side, for scroll-to.
    pub new_start: u32,
    /// Added lines in the hunk.
    pub added: u32,
    /// Removed lines in the hunk.
    pub removed: u32,
    /// One patch per added line, when the hunk is unambiguous — no removals, so
    /// keeping the context and one `+` line is a patch that means exactly what
    /// it looks like. Empty for a hunk with removals, where a line in isolation
    /// would be a guess about which side of a replacement you wanted.
    pub line_patches: Vec<LinePatch>,
}

/// One added line of a hunk, with a patch that stages just it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinePatch {
    /// 1-based line on the working-tree side.
    pub line: u32,
    /// The line's text, without the leading `+`.
    pub text: String,
    pub patch: String,
}

/// Split a pure-addition hunk into one patch per added line.
///
/// Only for hunks with no removals: there, every other `+` line can be dropped
/// and the context kept, and the result is a patch that adds exactly one line.
/// A hunk that also removes lines has no such reading — a `+` in a replacement
/// belongs with the `-` it replaces — so those get nothing rather than something
/// that might stage a half-change.
fn split_hunk_lines(
    header: &[&str],
    hunk_header: &str,
    body: &[String],
    new_start: u32,
) -> Vec<LinePatch> {
    if body.iter().any(|l| l.starts_with('-')) {
        return Vec::new();
    }
    let added: Vec<usize> = body
        .iter()
        .enumerate()
        .filter(|(_, l)| l.starts_with('+'))
        .map(|(i, _)| i)
        .collect();
    // A hunk with one addition is already the finest grain there is.
    if added.len() < 2 {
        return Vec::new();
    }

    let mut out = Vec::new();
    for &keep in &added {
        let mut patch = header.join("\n");
        patch.push('\n');
        patch.push_str(hunk_header);
        patch.push('\n');
        // Offset of this line on the new side: context lines before it, plus one.
        let mut line = new_start;
        for (i, l) in body.iter().enumerate() {
            // Keep every context line, and exactly one of the additions: the
            // other `+` lines are what this patch is deliberately leaving behind.
            if i == keep || !l.starts_with('+') {
                patch.push_str(l);
                patch.push('\n');
            }
            if i < keep && !l.starts_with('-') {
                line += 1;
            }
        }
        out.push(LinePatch {
            line,
            text: body[keep][1..].to_string(),
            patch,
        });
    }
    out
}

/// Split a unified diff of a single file into one applicable patch per hunk.
///
/// Each patch repeats the file's header lines, because `git apply` needs to know
/// which file it is patching — the hunk body alone is not a patch.
fn split_hunks(diff: &str) -> Vec<Hunk> {
    let mut lines = diff.lines().peekable();
    let mut header = Vec::new();
    // Everything before the first `@@` is the file header (diff/index/---/+++).
    while let Some(line) = lines.peek() {
        if line.starts_with("@@") {
            break;
        }
        header.push(*line);
        lines.next();
    }
    if header.is_empty() {
        return Vec::new();
    }

    let mut hunks = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;
    let flush = |current: Option<(String, Vec<String>)>, hunks: &mut Vec<Hunk>, header: &[&str]| {
        let Some((head, body)) = current else { return };
        let added = body.iter().filter(|l| l.starts_with('+')).count() as u32;
        let removed = body.iter().filter(|l| l.starts_with('-')).count() as u32;
        let new_start = head
            .split_whitespace()
            .find(|t| t.starts_with('+'))
            .and_then(|t| t[1..].split(',').next().and_then(|n| n.parse().ok()))
            .unwrap_or(1);
        let mut patch = header.join("\n");
        patch.push('\n');
        patch.push_str(&head);
        patch.push('\n');
        for line in &body {
            patch.push_str(line);
            patch.push('\n');
        }
        let line_patches = split_hunk_lines(header, &head, &body, new_start);
        hunks.push(Hunk {
            index: hunks.len(),
            header: head,
            patch,
            new_start,
            added,
            removed,
            line_patches,
        });
    };

    for line in lines {
        if line.starts_with("@@") {
            flush(current.take(), &mut hunks, &header);
            current = Some((line.to_string(), Vec::new()));
        } else if let Some((_, body)) = current.as_mut() {
            body.push(line.to_string());
        }
    }
    flush(current.take(), &mut hunks, &header);
    hunks
}

/// The hunks of one file's diff. `staged` reads the index against HEAD (what a
/// commit would contain); otherwise the working tree against the index.
#[tauri::command]
pub fn git_file_hunks(root: String, file: String, staged: bool) -> Vec<Hunk> {
    let mut args = vec!["diff", "--no-color", "--no-ext-diff", "--unified=3"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    let path = Path::new(&root);
    let mut all = args.clone();
    all.push(&file);
    match run_git_raw(path, &all) {
        Some(diff) => split_hunks(&diff),
        None => Vec::new(),
    }
}

/// Whether a patch only touches paths inside the project.
///
/// `git apply` is run with the repo as its cwd and without `--unsafe-paths`, so
/// it already refuses to write outside the working tree; this rejects the patch
/// before it gets there, so a traversal attempt is an error we report rather than
/// a git message we relay.
fn patch_is_confined(patch: &str) -> bool {
    patch
        .lines()
        .filter(|l| l.starts_with("--- ") || l.starts_with("+++ "))
        .all(|l| {
            let path = l[4..].trim();
            let path = path
                .strip_prefix("a/")
                .or_else(|| path.strip_prefix("b/"))
                .unwrap_or(path);
            path == "/dev/null"
                || (!path.starts_with('/')
                    && !path.starts_with("..")
                    && !path.split(['/', '\\']).any(|c| c == ".."))
        })
}

/// Apply a patch with `git apply`.
///
/// `cached` targets the index (staging or unstaging); without it the patch hits
/// the working tree (discarding). `reverse` undoes rather than applies, which is
/// how unstage and discard are expressed — the same patch, run backwards.
#[tauri::command]
pub fn git_apply_patch(
    root: String,
    patch: String,
    cached: bool,
    reverse: bool,
) -> Result<(), String> {
    if !patch_is_confined(&patch) {
        return Err("the patch names a path outside the project".into());
    }
    let mut cmd = command("git");
    cmd.arg("-C").arg(&root).arg("apply");
    if cached {
        cmd.arg("--cached");
    }
    if reverse {
        cmd.arg("--reverse");
    }
    // `--recount` tolerates a hunk whose line counts we recomputed; `-` reads the
    // patch from stdin, so nothing is written to a temp file.
    cmd.args(["--recount", "-"]);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    {
        use std::io::Write;
        let stdin = child.stdin.as_mut().ok_or("could not write the patch")?;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if err.is_empty() {
        "git apply failed".into()
    } else {
        err
    })
}

/// One conflicted region of a file: what each side wants, and where it sits.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegion {
    pub index: usize,
    /// 1-based line of the `<<<<<<<` marker.
    pub start_line: u32,
    /// 1-based line of the `>>>>>>>` marker.
    pub end_line: u32,
    /// The label after `<<<<<<<` (usually the current branch).
    pub ours_label: String,
    /// The label after `>>>>>>>` (the branch being merged).
    pub theirs_label: String,
    pub ours: String,
    pub theirs: String,
}

/// Which side to keep when resolving a region.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Ours,
    Theirs,
    /// Keep both, ours first — the common "these are independent additions".
    Both,
}

/// Parse a file's conflict markers into regions.
///
/// Reado does not run the merge, so the markers on disk are the only record of
/// what the two sides wanted; parsing them here means the view and the resolver
/// agree on the region boundaries by construction.
fn parse_conflicts(text: &str) -> Vec<ConflictRegion> {
    let mut regions = Vec::new();
    let mut ours: Vec<&str> = Vec::new();
    let mut theirs: Vec<&str> = Vec::new();
    let mut state = 0; // 0 = outside, 1 = in ours, 2 = in theirs
    let mut start = 0u32;
    let mut ours_label = String::new();

    for (i, line) in text.lines().enumerate() {
        let no = i as u32 + 1;
        if let Some(label) = line.strip_prefix("<<<<<<< ") {
            state = 1;
            start = no;
            ours_label = label.trim().to_string();
            ours.clear();
            theirs.clear();
        } else if state == 1 && line.starts_with("=======") {
            state = 2;
        } else if state == 2 {
            if let Some(label) = line.strip_prefix(">>>>>>> ") {
                regions.push(ConflictRegion {
                    index: regions.len(),
                    start_line: start,
                    end_line: no,
                    ours_label: ours_label.clone(),
                    theirs_label: label.trim().to_string(),
                    ours: ours.join("\n"),
                    theirs: theirs.join("\n"),
                });
                state = 0;
            } else {
                theirs.push(line);
            }
        } else if state == 1 {
            ours.push(line);
        }
    }
    regions
}

/// The conflicted regions of a file, or empty when it has none.
#[tauri::command]
pub fn git_conflict_regions(root: String, file: String) -> Result<Vec<ConflictRegion>, String> {
    let path = Path::new(&root).join(&file);
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(parse_conflicts(&text))
}

/// Replace one conflicted region with the chosen side, markers and all.
fn resolve_in(text: &str, index: usize, side: Side) -> Option<String> {
    let regions = parse_conflicts(text);
    let region = regions.get(index)?;
    let lines: Vec<&str> = text.lines().collect();
    let kept = match side {
        Side::Ours => region.ours.clone(),
        Side::Theirs => region.theirs.clone(),
        Side::Both if region.ours.is_empty() => region.theirs.clone(),
        Side::Both if region.theirs.is_empty() => region.ours.clone(),
        Side::Both => format!("{}\n{}", region.ours, region.theirs),
    };

    let before = &lines[..(region.start_line as usize - 1)];
    let after = &lines[region.end_line as usize..];
    let mut out: Vec<&str> = before.to_vec();
    if !kept.is_empty() {
        out.extend(kept.lines());
    }
    out.extend_from_slice(after);
    let mut joined = out.join("\n");
    // Preserve the file's trailing newline: dropping it would show as a spurious
    // one-line diff on every resolve.
    if text.ends_with('\n') {
        joined.push('\n');
    }
    Some(joined)
}

/// Resolve one conflicted region by keeping a side. The file is rewritten with
/// that region's markers gone; the others are left for the next decision.
#[tauri::command]
pub fn git_resolve_conflict(
    root: String,
    file: String,
    index: usize,
    side: Side,
) -> Result<(), String> {
    let path = Path::new(&root).join(&file);
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let resolved = resolve_in(&text, index, side).ok_or("no such conflicted region")?;
    std::fs::write(&path, resolved).map_err(|e| e.to_string())
}

/// Abandon an in-progress merge (`git merge --abort`).
#[tauri::command]
pub fn git_merge_abort(root: String) -> Result<(), String> {
    run_git_checked(&root, &["merge", "--abort"])
}

/// Abandon an in-progress rebase (`git rebase --abort`).
#[tauri::command]
pub fn git_rebase_abort(root: String) -> Result<(), String> {
    run_git_checked(&root, &["rebase", "--abort"])
}

#[cfg(test)]
mod review_grade_tests {
    use super::*;

    const DIFF: &str = "diff --git a/src/a.ts b/src/a.ts\nindex 1111111..2222222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n one\n+two\n three\n four\n@@ -10,2 +11,2 @@\n-old\n+new\n";

    #[test]
    fn splits_a_diff_into_one_applicable_patch_per_hunk() {
        let hunks = split_hunks(DIFF);
        assert_eq!(hunks.len(), 2);
        // Each patch must carry the file headers: a hunk body alone is not a
        // patch, and `git apply` would not know what it is patching.
        for h in &hunks {
            assert!(h.patch.starts_with("diff --git a/src/a.ts b/src/a.ts"));
            assert!(h.patch.contains("--- a/src/a.ts"));
            assert!(h.patch.contains("+++ b/src/a.ts"));
        }
        // …and only its own hunk.
        assert!(hunks[0].patch.contains("+two"));
        assert!(!hunks[0].patch.contains("+new"));
        assert!(hunks[1].patch.contains("+new"));
        assert!(!hunks[1].patch.contains("+two"));
    }

    #[test]
    fn counts_a_hunks_additions_and_removals() {
        let hunks = split_hunks(DIFF);
        assert_eq!((hunks[0].added, hunks[0].removed), (1, 0));
        assert_eq!((hunks[1].added, hunks[1].removed), (1, 1));
        assert_eq!(hunks[0].new_start, 1);
        assert_eq!(hunks[1].new_start, 11);
    }

    const ADDITIONS: &str = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,4 @@\n one\n+two\n+three\n four\n";

    #[test]
    fn a_pure_addition_hunk_offers_one_patch_per_line() {
        let hunks = split_hunks(ADDITIONS);
        let lines = &hunks[0].line_patches;
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "two");
        assert_eq!(lines[1].text, "three");
        // Each patch keeps the context and exactly one of the additions, so it
        // means what it looks like.
        assert!(lines[0].patch.contains("+two"));
        assert!(!lines[0].patch.contains("+three"));
        assert!(lines[0].patch.contains(" one"));
        assert!(lines[1].patch.contains("+three"));
        assert!(!lines[1].patch.contains("+two"));
    }

    #[test]
    fn a_line_patch_reports_where_the_line_lands() {
        let lines = &split_hunks(ADDITIONS)[0].line_patches;
        assert_eq!(lines[0].line, 2);
        assert_eq!(lines[1].line, 3);
    }

    #[test]
    fn a_hunk_with_removals_offers_no_line_patches() {
        // A `+` inside a replacement belongs with the `-` it replaces; staging
        // it alone would be a guess about which side you wanted.
        let hunks = split_hunks(DIFF);
        assert!(hunks[1].line_patches.is_empty());
    }

    #[test]
    fn a_single_addition_needs_no_finer_grain() {
        let one = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n one\n+two\n";
        assert!(split_hunks(one)[0].line_patches.is_empty());
    }

    #[test]
    fn an_empty_diff_has_no_hunks() {
        assert!(split_hunks("").is_empty());
        assert!(split_hunks("diff --git a/x b/x\n").is_empty());
    }

    #[test]
    fn a_patch_escaping_the_project_is_refused() {
        let escape = "diff --git a/../../etc/passwd b/../../etc/passwd\n--- a/../../etc/passwd\n+++ b/../../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n";
        assert!(!patch_is_confined(escape));
        let absolute = "--- /etc/passwd\n+++ /etc/passwd\n";
        assert!(!patch_is_confined(absolute));
        assert!(patch_is_confined(DIFF));
    }

    #[test]
    fn a_patch_escaping_through_a_mid_path_dotdot_is_refused() {
        // The prefix checks miss this one: the path starts with a harmless
        // `src/`, and only the component scan catches the traversal.
        let sneaky = "diff --git a/src/../../../.ssh/authorized_keys b/src/../../../.ssh/authorized_keys\n--- a/src/../../../.ssh/authorized_keys\n+++ b/src/../../../.ssh/authorized_keys\n@@ -1 +1 @@\n-x\n+y\n";
        assert!(!patch_is_confined(sneaky));
        // Windows separators are a traversal too.
        let backslashed = "--- a/src\\..\\..\\evil\n+++ b/src\\..\\..\\evil\n";
        assert!(!patch_is_confined(backslashed));
        // A file legitimately named with dots is still fine.
        let dotted = "--- a/src/..config/x.ts\n+++ b/src/..config/x.ts\n";
        assert!(patch_is_confined(dotted));
    }

    #[test]
    fn a_new_file_patch_is_confined_despite_dev_null() {
        let created =
            "diff --git a/new.ts b/new.ts\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+x\n";
        assert!(patch_is_confined(created));
    }

    const CONFLICT: &str =
        "before\n<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> feature\nafter\n";

    #[test]
    fn parses_a_conflict_region_with_both_sides_and_their_labels() {
        let regions = parse_conflicts(CONFLICT);
        assert_eq!(regions.len(), 1);
        let r = &regions[0];
        assert_eq!(r.start_line, 2);
        assert_eq!(r.end_line, 6);
        assert_eq!(r.ours_label, "HEAD");
        assert_eq!(r.theirs_label, "feature");
        assert_eq!(r.ours, "ours line");
        assert_eq!(r.theirs, "theirs line");
    }

    #[test]
    fn a_file_without_markers_has_no_regions() {
        assert!(parse_conflicts("just code\n").is_empty());
    }

    #[test]
    fn a_separator_outside_a_conflict_is_ordinary_text() {
        // `=======` is a Markdown setext rule, an ASCII table edge, a changelog
        // divider. Without the state guard the parser treats one as the start of
        // "theirs" and reports a phantom region — which `git_resolve_conflict`
        // would then happily rewrite the file from.
        assert!(parse_conflicts("Title\n=======\nbody\n>>>>>>> nope\n").is_empty());

        // A rule *before* a real conflict must not disturb it either.
        let mixed = "Title\n=======\nintro\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n";
        let regions = parse_conflicts(mixed);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].start_line, 4);
    }

    #[test]
    fn parses_several_regions_independently() {
        let two = format!("{CONFLICT}{CONFLICT}");
        let regions = parse_conflicts(&two);
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[1].index, 1);
    }

    #[test]
    fn resolving_keeps_the_chosen_side_and_drops_the_markers() {
        let ours = resolve_in(CONFLICT, 0, Side::Ours).unwrap();
        assert_eq!(ours, "before\nours line\nafter\n");
        let theirs = resolve_in(CONFLICT, 0, Side::Theirs).unwrap();
        assert_eq!(theirs, "before\ntheirs line\nafter\n");
        let both = resolve_in(CONFLICT, 0, Side::Both).unwrap();
        assert_eq!(both, "before\nours line\ntheirs line\nafter\n");
    }

    #[test]
    fn resolving_one_region_leaves_the_others_conflicted() {
        let two = format!("{CONFLICT}{CONFLICT}");
        let resolved = resolve_in(&two, 0, Side::Ours).unwrap();
        assert_eq!(
            parse_conflicts(&resolved).len(),
            1,
            "the second still stands"
        );
    }

    #[test]
    fn resolving_preserves_the_trailing_newline() {
        let without = "a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b";
        assert!(!resolve_in(without, 0, Side::Ours).unwrap().ends_with('\n'));
        assert!(resolve_in(CONFLICT, 0, Side::Ours).unwrap().ends_with('\n'));
    }

    #[test]
    fn keeping_both_of_an_empty_side_does_not_add_a_blank_line() {
        let empty_ours = "a\n<<<<<<< HEAD\n=======\ny\n>>>>>>> b\n";
        assert_eq!(resolve_in(empty_ours, 0, Side::Both).unwrap(), "a\ny\n");
    }

    #[test]
    fn resolving_an_unknown_region_is_refused() {
        assert!(resolve_in(CONFLICT, 5, Side::Ours).is_none());
    }

    /// A repository with one committed file, for the `git_show_ref` cases below.
    fn repo_with_one_commit() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let git = |args: &[&str]| {
            let ok = command("git")
                .arg("-C")
                .arg(root)
                .args(args)
                .output()
                .expect("git is available")
                .status
                .success();
            assert!(ok, "git {args:?} failed");
        };
        git(&["init", "--initial-branch=main"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        std::fs::write(root.join("tracked.txt"), "one\ntwo\n").unwrap();
        git(&["add", "tracked.txt"]);
        git(&["commit", "-m", "first"]);
        dir
    }

    #[test]
    fn the_diff_base_of_a_committed_file_is_its_committed_contents() {
        let dir = repo_with_one_commit();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "tracked.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some("one\ntwo\n"));
    }

    #[test]
    fn a_file_added_since_the_base_diffs_against_an_empty_base() {
        // A brand-new file isn't in HEAD. That's not "no base to diff against" —
        // it's a file whose every line is added, so the base is an empty document
        // and the diff reads all-green.
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("brand-new.txt"), "hello\n").unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "brand-new.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some(""));
    }

    #[test]
    fn a_staged_new_file_also_diffs_against_an_empty_base() {
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("staged.txt"), "hello\n").unwrap();
        command("git")
            .arg("-C")
            .arg(dir.path())
            .args(["add", "staged.txt"])
            .output()
            .unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "staged.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text.as_deref(), Some(""));
    }

    #[test]
    fn reading_a_file_absent_from_the_ref_still_reports_nothing() {
        // git_show_ref keeps its old contract: the PR reader falls back to the
        // working tree when the path isn't in the ref.
        let dir = repo_with_one_commit();
        std::fs::write(dir.path().join("brand-new.txt"), "hello\n").unwrap();
        let text = git_show_ref(
            dir.path().to_string_lossy().into_owned(),
            "brand-new.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text, None);
    }

    #[test]
    fn a_base_that_does_not_resolve_has_no_contents_at_all() {
        // Only here is there genuinely nothing to diff against.
        let dir = repo_with_one_commit();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "tracked.txt".into(),
            "no-such-branch".into(),
        );
        assert_eq!(text, None);
    }

    #[test]
    fn outside_a_repository_there_is_no_base() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();
        let text = git_diff_base(
            dir.path().to_string_lossy().into_owned(),
            "a.txt".into(),
            "HEAD".into(),
        );
        assert_eq!(text, None);
    }
}

// ---- Fixing what just happened ----------------------------------------------
//
// Amend, revert, cherry-pick, tags and remotes. These are what a reader reaches
// for *after* a commit — a typo in the message, a commit that has to come back
// out, a fix that belongs on this branch too — and until now every one of them
// meant leaving the editor for a terminal.

/// Whether the commit at HEAD is already on the upstream.
///
/// Amending it then rewrites history other people may already have, which is a
/// different decision from fixing a commit that never left this machine — so the
/// UI asks first, and this is the question behind that.
#[tauri::command]
pub fn git_head_is_pushed(root: String) -> bool {
    let path = Path::new(&root);
    let Some(head) = run_git(path, &["rev-parse", "HEAD"]) else {
        return false;
    };
    // `branch -r --contains` lists the remote branches holding this commit;
    // anything at all means it is out there.
    run_git(path, &["branch", "-r", "--contains", head.trim()])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

/// Amend the last commit with whatever is staged. An empty message reuses the
/// existing one (`--no-edit`), which is the "I forgot a file" case.
#[tauri::command]
pub fn git_amend(root: String, message: Option<String>) -> Result<(), String> {
    match message.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        Some(m) => run_git_checked(&root, &["commit", "--amend", "-m", m]),
        None => run_git_checked(&root, &["commit", "--amend", "--no-edit"]),
    }
}

/// What an apply-a-commit operation did.
#[derive(Debug, serde::Serialize)]
pub struct ApplyOutcome {
    /// Files left conflicted; empty means it applied cleanly.
    pub conflicted: Vec<String>,
}

/// Revert a commit: a new commit that undoes it, leaving the original in place.
#[tauri::command]
pub fn git_revert(root: String, commit: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["revert", "--no-edit", commit.trim()])
}

/// Apply one commit from elsewhere onto the current branch.
#[tauri::command]
pub fn git_cherry_pick(root: String, commit: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["cherry-pick", commit.trim()])
}

/// The shared half of revert and cherry-pick: run it, and read a failure as
/// conflicts when that is what it is.
fn apply_commit(root: &str, args: &[&str]) -> Result<ApplyOutcome, String> {
    apply_commit_env(root, args, &[])
}

/// As [`apply_commit`], carrying environment variables through.
fn apply_commit_env(
    root: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<ApplyOutcome, String> {
    match run_git_checked_env(root, args, env) {
        Ok(()) => Ok(ApplyOutcome { conflicted: vec![] }),
        Err(e) => {
            // Not a failure with a message nobody can act on: it is work waiting
            // in the working tree, and Reado already has a resolver for it.
            let conflicted = conflicted_files(root);
            if conflicted.is_empty() {
                Err(e)
            } else {
                Ok(ApplyOutcome { conflicted })
            }
        }
    }
}

/// The repository's tags, newest first.
#[tauri::command]
pub fn git_tags(root: String) -> Vec<String> {
    run_git(Path::new(&root), &["tag", "--sort=-creatordate", "--list"])
        .map(|s| {
            s.lines()
                .map(str::to_string)
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Create a tag at HEAD. With a message it is annotated, which is what a release
/// wants; without, it is the lightweight kind.
#[tauri::command]
pub fn git_tag_create(root: String, name: String, message: Option<String>) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Empty tag name".into());
    }
    match message.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        Some(m) => run_git_checked(&root, &["tag", "-a", name, "-m", m]),
        None => run_git_checked(&root, &["tag", name]),
    }
}

/// Delete a tag locally.
#[tauri::command]
pub fn git_tag_delete(root: String, name: String) -> Result<(), String> {
    run_git_checked(&root, &["tag", "-d", name.trim()])
}

/// A remote and where it points.
#[derive(serde::Serialize)]
pub struct Remote {
    pub name: String,
    pub url: String,
}

/// The repository's remotes.
#[tauri::command]
pub fn git_remotes(root: String) -> Vec<Remote> {
    run_git(Path::new(&root), &["remote", "-v"])
        .map(|s| {
            let mut out: Vec<Remote> = Vec::new();
            for line in s.lines() {
                // `origin\tgit@host:repo (fetch)` — the fetch and push rows name
                // the same remote, so the second one is a duplicate.
                let mut parts = line.split_whitespace();
                let (Some(name), Some(url)) = (parts.next(), parts.next()) else {
                    continue;
                };
                if out.iter().any(|r| r.name == name) {
                    continue;
                }
                out.push(Remote {
                    name: name.to_string(),
                    url: url.to_string(),
                });
            }
            out
        })
        .unwrap_or_default()
}

/// Add a remote.
#[tauri::command]
pub fn git_remote_add(root: String, name: String, url: String) -> Result<(), String> {
    let (name, url) = (name.trim(), url.trim());
    if name.is_empty() || url.is_empty() {
        return Err("A remote needs a name and a URL".into());
    }
    run_git_checked(&root, &["remote", "add", name, url])
}

/// Remove a remote.
#[tauri::command]
pub fn git_remote_remove(root: String, name: String) -> Result<(), String> {
    run_git_checked(&root, &["remote", "remove", name.trim()])
}

// ---------------------------------------------------------------------------
// The rest of the daily loop: merging, rebasing, worktrees, submodules, and the
// history as a graph. What these have in common is that they were the reasons
// left to open a terminal.
// ---------------------------------------------------------------------------

/// Merge a branch into the current one. A conflicting merge is not an error —
/// it is work waiting in the working tree, the same as a cherry-pick's.
#[tauri::command]
pub fn git_merge(root: String, branch: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["merge", "--no-edit", branch.trim()])
}

/// Replay this branch's commits on top of another (`git rebase <onto>`).
#[tauri::command]
pub fn git_rebase(root: String, onto: String) -> Result<ApplyOutcome, String> {
    apply_commit(&root, &["rebase", onto.trim()])
}

/// What the sequencer is in the middle of, if anything. The conflict resolver
/// needs it to know what finishing means: a merge ends with a commit, a rebase
/// with `--continue`, and telling the user to commit during a rebase is how a
/// rebase gets lost.
#[tauri::command]
pub fn git_sequencer(root: String) -> Option<String> {
    let dir = run_git(Path::new(&root), &["rev-parse", "--git-dir"])?;
    let dir = Path::new(&root).join(dir.trim());
    // `rebase-merge` is the interactive/merge backend, `rebase-apply` the old
    // am-based one; either means a rebase is halfway through.
    for (marker, state) in [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
        ("MERGE_HEAD", "merge"),
    ] {
        if dir.join(marker).exists() {
            return Some(state.to_string());
        }
    }
    None
}

/// Carry on after the conflicts of a rebase / cherry-pick / revert are resolved.
/// Staging is ours to do: git will not continue with unmerged paths, and the
/// resolver writes the files without touching the index.
#[tauri::command]
pub fn git_sequencer_continue(root: String) -> Result<ApplyOutcome, String> {
    let op = git_sequencer(root.clone()).ok_or("Nothing to continue.")?;
    if op == "merge" {
        return Err("Finish a merge by committing.".into());
    }
    run_git_checked(&root, &["add", "-A"])?;
    // `--no-edit` keeps the commit message git already has, and `GIT_EDITOR`
    // catches the editor git opens anyway on the paths that ignore it — an
    // interactive rebase continuing through a squash is one. Without both, the
    // command waits forever on an editor that does not exist here.
    apply_commit_env(
        &root,
        &[op.as_str(), "--continue", "--no-edit"],
        &[("GIT_EDITOR", "true")],
    )
}

/// One line of an interactive rebase's plan.
#[derive(Debug, Deserialize)]
pub struct TodoLine {
    /// One of [`TODO_ACTIONS`].
    pub action: String,
    pub hash: String,
}

/// What a plan may ask for. `reword` is absent on purpose: it is the one action
/// that opens an editor per commit, and it has no answer to give here — Reado
/// amends instead. Anything outside this list is refused rather than written:
/// these lines go into a file git *executes*, so the list is a trust boundary,
/// not a convenience.
const TODO_ACTIONS: [&str; 4] = ["pick", "squash", "fixup", "drop"];

/// The commits an interactive rebase onto `upstream` would replay, oldest first
/// — the order the todo file uses, so the UI can present the plan as git will.
///
/// `--no-merges` because that is what git's own todo contains: a plain
/// `rebase -i` flattens history and never lists a merge, and asking it to `pick`
/// one is an error. Listing a commit the plan cannot act on would be offering a
/// button that fails.
#[tauri::command]
pub fn git_rebase_commits(root: String, upstream: String) -> Vec<GitCommit> {
    run_git(
        Path::new(&root),
        &[
            "log",
            "--reverse",
            "--no-merges",
            "--format=%H%x1f%s",
            &format!("{}..HEAD", upstream.trim()),
        ],
    )
    .map(|s| {
        s.lines()
            .filter_map(|l| l.split_once('\x1f'))
            .map(|(hash, subject)| GitCommit {
                hash: hash.to_string(),
                subject: subject.to_string(),
            })
            .collect()
    })
    .unwrap_or_default()
}

/// Run an interactive rebase from a plan Reado already has.
///
/// `git rebase -i` wants a human with an editor: it writes a todo file and opens
/// `$GIT_SEQUENCE_EDITOR` on it. Reado has the plan the moment the user presses
/// the button, so the "editor" is a copy of our file over git's — the same
/// mechanism `GIT_SEQUENCE_EDITOR=true` uses to accept the default, pointed at a
/// file instead. `GIT_EDITOR=true` covers the second editor git opens, for the
/// message of a squash.
#[tauri::command]
pub fn git_rebase_interactive(
    root: String,
    upstream: String,
    todo: Vec<TodoLine>,
) -> Result<ApplyOutcome, String> {
    if todo.is_empty() {
        return Err("Nothing to rebase.".into());
    }
    for line in &todo {
        if !TODO_ACTIONS.contains(&line.action.as_str()) {
            return Err(format!("Unknown rebase action: {}", line.action));
        }
        if line.hash.len() < 4 || !line.hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("A rebase plan takes commit hashes.".into());
        }
    }
    if todo.iter().all(|l| l.action == "drop") {
        return Err("A rebase that drops every commit would leave nothing.".into());
    }
    // A squash or fixup has nothing to fold into when it is first.
    if matches!(todo[0].action.as_str(), "squash" | "fixup") {
        return Err("The first commit has nothing to squash into.".into());
    }
    let plan: String = todo
        .iter()
        .map(|l| format!("{} {}\n", l.action, l.hash))
        .collect();
    // Written beside the repo's git dir rather than the system temp: it holds
    // commit hashes, and it is deleted either way.
    let file = std::env::temp_dir().join(format!("reado-rebase-{}.todo", std::process::id()));
    std::fs::write(&file, plan).map_err(|e| e.to_string())?;
    let quoted = file.display();
    let editor = if cfg!(windows) {
        format!("cmd /c copy /y \"{quoted}\"")
    } else {
        format!("cp '{quoted}'")
    };
    let outcome = apply_commit_env(
        &root,
        &["rebase", "-i", upstream.trim()],
        &[("GIT_SEQUENCE_EDITOR", &editor), ("GIT_EDITOR", "true")],
    );
    let _ = std::fs::remove_file(&file);
    outcome
}

/// A checkout of the same repository in another directory.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    /// Branch checked out there, or `None` when detached.
    pub branch: Option<String>,
    /// The repository's own working tree, which cannot be removed.
    pub is_main: bool,
}

/// The repository's worktrees, main one first (git lists it first).
#[tauri::command]
pub fn git_worktrees(root: String) -> Vec<Worktree> {
    let Some(out) = run_git(Path::new(&root), &["worktree", "list", "--porcelain"]) else {
        return vec![];
    };
    let mut trees: Vec<Worktree> = Vec::new();
    // Records are separated by a blank line; `worktree <path>` opens each one.
    for record in out.split("\n\n") {
        let mut path = None;
        let mut branch = None;
        for line in record.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                path = Some(p.to_string());
            } else if let Some(b) = line.strip_prefix("branch ") {
                branch = Some(b.trim_start_matches("refs/heads/").to_string());
            }
        }
        if let Some(path) = path {
            trees.push(Worktree {
                path,
                branch,
                is_main: trees.is_empty(),
            });
        }
    }
    trees
}

/// Check out a branch into a new directory. With `new_branch`, the branch is
/// created there — which is the reason to want a worktree: a second branch open
/// beside this one without stashing what is in front of you.
#[tauri::command]
pub fn git_worktree_add(
    root: String,
    path: String,
    branch: String,
    new_branch: bool,
) -> Result<(), String> {
    let (path, branch) = (path.trim(), branch.trim());
    if path.is_empty() || branch.is_empty() {
        return Err("A worktree needs a directory and a branch".into());
    }
    if new_branch {
        run_git_checked(&root, &["worktree", "add", "-b", branch, path])
    } else {
        run_git_checked(&root, &["worktree", "add", path, branch])
    }
}

/// Remove a worktree. Git refuses one holding changes, which is the right
/// answer — discarding someone's work needs a UI that says so first.
#[tauri::command]
pub fn git_worktree_remove(root: String, path: String) -> Result<(), String> {
    run_git_checked(&root, &["worktree", "remove", path.trim()])
}

/// A repository nested inside this one.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Submodule {
    pub path: String,
    /// The commit the parent repository pins.
    pub sha: String,
    /// Whether it has been cloned into the working tree. An uninitialized
    /// submodule is an empty directory, which is what makes a build fail with a
    /// missing file nobody can find.
    pub initialized: bool,
    /// Checked out at a commit other than the pinned one.
    pub modified: bool,
}

/// The submodules declared by this repository.
#[tauri::command]
pub fn git_submodules(root: String) -> Vec<Submodule> {
    run_git(Path::new(&root), &["submodule", "status"])
        .map(|s| {
            s.lines()
                .filter_map(|line| {
                    // ` <sha> <path> (<describe>)`, with a leading `-` for not
                    // initialized and `+` for a different commit than pinned.
                    let mark = line.chars().next()?;
                    let rest = line.get(1..)?;
                    let mut parts = rest.split_whitespace();
                    let sha = parts.next()?.to_string();
                    let path = parts.next()?.to_string();
                    Some(Submodule {
                        path,
                        sha,
                        initialized: mark != '-',
                        modified: mark == '+',
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Clone and update submodules — all of them, or one. This is the command the
/// "why is that directory empty" answer always turns out to be.
#[tauri::command]
pub fn git_submodule_update(root: String, path: Option<String>) -> Result<(), String> {
    let mut args = vec!["submodule", "update", "--init", "--recursive"];
    let path = path.unwrap_or_default();
    let path = path.trim();
    if !path.is_empty() {
        args.push("--");
        args.push(path);
    }
    run_git_checked(&root, &args)
}

/// Whether this repository signs what it commits (`commit.gpgsign`).
#[tauri::command]
pub fn git_signing(root: String) -> bool {
    run_git(Path::new(&root), &["config", "--get", "commit.gpgsign"])
        .map(|v| v.trim() == "true")
        .unwrap_or(false)
}

/// Whether this repository can actually sign, and what is missing when it
/// cannot.
///
/// Turning signing on writes two config keys and nothing else happens — until
/// the next commit, which git refuses with gpg's own error. That is the wrong
/// moment to find out, so the switch asks first. Returns an empty string when
/// signing is ready; otherwise a reason the UI translates.
///
/// The checks are the ones that are certain, never a guess: SSH signing cannot
/// work without an explicit key, GPG signing cannot work without gpg, and gpg
/// with neither a configured key nor a secret key for the committer's address
/// has nothing to sign with. Anything else is left alone — a false warning on a
/// working setup would teach the user to ignore the real one.
#[tauri::command]
pub fn git_signing_check(root: String) -> String {
    let path = Path::new(&root);
    let cfg = |key: &str| {
        run_git(path, &["config", "--get", key])
            .map(|v| v.trim().to_string())
            .unwrap_or_default()
    };
    let key = cfg("user.signingkey");
    if cfg("gpg.format") == "ssh" {
        return if key.is_empty() {
            "no-ssh-key".into()
        } else {
            String::new()
        };
    }
    if crate::proc::command("gpg")
        .arg("--version")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        return "no-gpg".into();
    }
    if !key.is_empty() {
        return String::new();
    }
    // No key named: gpg may still hold one for the committer's address, which is
    // how an unconfigured-but-working setup signs.
    let email = cfg("user.email");
    if email.is_empty() {
        return "no-key".into();
    }
    let found = crate::proc::command("gpg")
        .args(["--list-secret-keys", "--batch", &email])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if found {
        String::new()
    } else {
        "no-key".into()
    }
}

/// Turn commit and tag signing on or off for this repository.
///
/// Written to git's own config rather than kept as a Reado setting: the key
/// already exists, every other git tool reads it, and a second source of truth
/// would be one that disagrees. Signing needs a configured key and an agent that
/// can unlock it — without them git refuses the commit and says so.
#[tauri::command]
pub fn git_set_signing(root: String, on: bool) -> Result<(), String> {
    let value = if on { "true" } else { "false" };
    run_git_checked(&root, &["config", "commit.gpgsign", value])?;
    run_git_checked(&root, &["config", "tag.gpgsign", value])
}

/// One commit as the graph draws it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub hash: String,
    /// Parent hashes: none for the root, two or more for a merge — which is
    /// what the lanes are drawn from.
    pub parents: Vec<String>,
    pub subject: String,
    pub author: String,
    /// Relative ("3 days ago"), because that is what the eye wants here.
    pub date: String,
    /// Branch and tag names pointing at this commit, already stripped of their
    /// `refs/` prefixes by `%D`.
    pub refs: Vec<String>,
}

/// The history of every branch, newest first, for the graph view.
///
/// `--date-order` rather than git's default: it keeps a branch's commits
/// together instead of interleaving branches by commit date, which is what makes
/// the lanes readable.
#[tauri::command]
pub fn git_graph(root: String, limit: u32) -> Vec<GraphCommit> {
    let limit = limit.clamp(1, 5000).to_string();
    run_git(
        Path::new(&root),
        &[
            "log",
            "--all",
            "--date-order",
            "--max-count",
            &limit,
            "--format=%H%x1f%P%x1f%s%x1f%an%x1f%ar%x1f%D",
        ],
    )
    .map(|s| {
        s.lines()
            .filter_map(|line| {
                let mut f = line.split('\x1f');
                Some(GraphCommit {
                    hash: f.next()?.to_string(),
                    parents: f.next()?.split_whitespace().map(str::to_string).collect(),
                    subject: f.next()?.to_string(),
                    author: f.next()?.to_string(),
                    date: f.next()?.to_string(),
                    refs: f
                        .next()
                        .unwrap_or("")
                        .split(", ")
                        .map(|r| r.trim().trim_start_matches("HEAD -> ").to_string())
                        .filter(|r| !r.is_empty())
                        .collect(),
                })
            })
            .collect()
    })
    .unwrap_or_default()
}

#[cfg(test)]
mod rebase_plan_tests {
    use super::*;

    fn line(action: &str, hash: &str) -> TodoLine {
        TodoLine {
            action: action.into(),
            hash: hash.into(),
        }
    }

    // The plan is written into a file git executes, so what may appear in it is
    // a trust boundary — checked before anything is written, in a directory that
    // need not even be a repository.
    #[test]
    fn refuses_anything_that_is_not_one_of_the_four_actions() {
        for bad in ["exec", "x; rm -rf /", "pick\nexec echo hi", ""] {
            let err = git_rebase_interactive(
                "/nonexistent".into(),
                "main".into(),
                vec![line(bad, "abc1234")],
            )
            .unwrap_err();
            assert!(err.contains("Unknown rebase action"), "{bad}: {err}");
        }
    }

    #[test]
    fn refuses_a_hash_that_is_not_one() {
        let err = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("pick", "$(whoami)")],
        )
        .unwrap_err();
        assert!(err.contains("commit hashes"), "{err}");
    }

    #[test]
    fn refuses_the_plans_git_would_refuse() {
        let empty = git_rebase_interactive("/nonexistent".into(), "main".into(), vec![]);
        assert!(empty.unwrap_err().contains("Nothing to rebase"));

        let all_dropped = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("drop", "aaaaaaa"), line("drop", "bbbbbbb")],
        );
        assert!(all_dropped.unwrap_err().contains("every commit"));

        let folds_first = git_rebase_interactive(
            "/nonexistent".into(),
            "main".into(),
            vec![line("squash", "aaaaaaa"), line("pick", "bbbbbbb")],
        );
        assert!(folds_first.unwrap_err().contains("nothing to squash"));
    }
}

#[cfg(test)]
mod rebase_range_tests {
    use super::*;
    use std::process::Command;

    /// A repository with a branch that was merged back, so the range being
    /// replayed contains a merge.
    fn repo_with_a_merge() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let at = dir.path();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(at)
                .args(args)
                .output()
                .expect("git");
            assert!(out.status.success(), "git {args:?}: {:?}", out);
        };
        let write = |name: &str, body: &str| std::fs::write(at.join(name), body).unwrap();
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@example.com"]);
        git(&["config", "user.name", "T"]);
        write("a", "one\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "start"]);
        git(&["checkout", "-qb", "side"]);
        write("b", "side\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "on the side"]);
        git(&["checkout", "-q", "main"]);
        write("c", "trunk\n");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "on the trunk"]);
        git(&["merge", "--no-ff", "-q", "-m", "merge side", "side"]);
        dir
    }

    // Found by running a rebase in the app: the plan listed the merge commit,
    // and git cannot `pick` one in a plain interactive rebase — it is not in the
    // todo it generates. Offering it is offering a button that fails.
    #[test]
    fn the_plan_leaves_out_merge_commits() {
        let dir = repo_with_a_merge();
        let root = dir.path().to_string_lossy().into_owned();
        let subjects: Vec<String> = git_rebase_commits(root, "start".into())
            .into_iter()
            .map(|c| c.subject)
            .collect();
        assert!(
            !subjects.iter().any(|s| s.starts_with("merge ")),
            "the merge commit must not be in the plan: {subjects:?}"
        );
        // And everything that *is* replayable still is, oldest first.
        assert_eq!(subjects, ["on the side", "on the trunk"]);
    }
}
