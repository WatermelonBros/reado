use super::{run_git_checked, run_git_raw};
use std::path::Path;

use serde::Serialize;

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
