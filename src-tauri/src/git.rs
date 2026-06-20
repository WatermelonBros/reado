//! Lightweight git introspection.
//!
//! Reado treats git as the user's own tool and only reads from it. Rather than
//! link a native git library, we shell out to the `git` binary for the two facts
//! the MVP needs: whether a folder is a repository, and its current branch.
//! Git-dependent features degrade gracefully when `git` is absent.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

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
    let output = Command::new("git")
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

/// One changed file in the working tree.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Project-relative path (the new path for renames).
    pub path: String,
    /// Category: "modified" | "added" | "deleted" | "renamed" | "untracked".
    pub status: String,
}

/// The working-tree status (read-only Source Control view). Reado never stages
/// or commits — git stays the user's tool; this only surfaces what changed.
#[tauri::command]
pub fn git_status(root: String) -> Vec<GitChange> {
    let Some(out) = run_git(Path::new(&root), &["status", "--porcelain"]) else {
        return Vec::new();
    };
    out.lines()
        .filter(|l| l.len() > 3)
        .map(|line| {
            let code = &line[..2];
            let mut path = line[3..].to_string();
            // Renames are "old -> new"; keep the new path.
            if let Some(idx) = path.find(" -> ") {
                path = path[idx + 4..].to_string();
            }
            let status = if code == "??" {
                "untracked"
            } else if code.contains('R') {
                "renamed"
            } else if code.contains('D') {
                "deleted"
            } else if code.contains('A') {
                "added"
            } else {
                "modified"
            };
            GitChange {
                path: path.trim_matches('"').to_string(),
                status: status.to_string(),
            }
        })
        .collect()
}

/// The committed (HEAD) contents of a tracked file, for the on-demand diff view.
/// Returns `None` when the file is untracked, new, or git is unavailable.
/// Unlike [`run_git`], the output is returned verbatim (no trimming) so the diff
/// is exact.
#[tauri::command]
pub fn git_show_head(root: String, file: String) -> Option<String> {
    // `git show HEAD:<path>` expects forward slashes, which is what we store.
    let output = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["show", &format!("HEAD:{file}")])
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}
