use super::{run_git, run_git_checked};
use std::path::Path;

use serde::Serialize;

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
