use super::status::conflicted_files;
use super::{run_git, run_git_checked};
use std::path::Path;

use serde::Serialize;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::repo;

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
}
