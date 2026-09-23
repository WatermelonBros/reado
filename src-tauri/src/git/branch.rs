use super::{run_git, run_git_checked};
use std::path::Path;

use serde::Serialize;

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

/// Create and switch to a new branch (`git checkout -b`).
#[tauri::command]
pub fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Empty branch name".into());
    }
    run_git_checked(&root, &["checkout", "-b", name])
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::repo;

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
}
