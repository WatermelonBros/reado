//! Tauri command wrappers over the shared annotation store (`reado-core`).
//!
//! All comment model and on-disk logic lives in `reado_core`, shared with the
//! `reado` CLI. This module only adapts those functions to the Tauri command
//! boundary (string roots in, JSON out, errors mapped to the app error type).

use reado_core::{self as core, Comment, CommentPatch, CommentState, CreateResult, NewComment};

use crate::error::Result;

#[tauri::command]
pub fn create_comment(root: String, input: NewComment) -> Result<CreateResult> {
    // Comments created from the desktop UI are authored by the user.
    Ok(core::create_comment(&root, input, "user", None)?)
}

#[tauri::command]
pub fn list_comments(root: String) -> Result<Vec<Comment>> {
    Ok(core::list_comments(&root))
}

#[tauri::command]
pub fn list_archived(root: String) -> Result<Vec<Comment>> {
    Ok(core::list_archived(&root))
}

#[tauri::command]
pub fn update_comment(root: String, id: String, patch: CommentPatch) -> Result<Comment> {
    Ok(core::update_comment(&root, &id, patch)?)
}

#[tauri::command]
pub fn add_reply(
    root: String,
    id: String,
    author: String,
    agent: Option<String>,
    body: String,
) -> Result<Comment> {
    Ok(core::add_reply(&root, &id, &author, agent, body)?)
}

#[tauri::command]
pub fn set_comment_state(root: String, id: String, state: CommentState) -> Result<Comment> {
    Ok(core::set_comment_state(&root, &id, state)?)
}

#[tauri::command]
pub fn delete_comment(root: String, id: String) -> Result<()> {
    Ok(core::delete_comment(&root, &id)?)
}

#[tauri::command]
pub fn add_reado_gitignore(root: String, versioned: bool) -> Result<()> {
    Ok(core::add_reado_gitignore(&root, versioned)?)
}

#[tauri::command]
pub fn read_project_config(root: String) -> Option<String> {
    core::read_config(&root)
}

#[tauri::command]
pub fn write_project_config(root: String, json: String) -> Result<()> {
    Ok(core::write_config(&root, &json)?)
}

#[tauri::command]
pub fn reanchor_file(root: String, file: String) -> Result<Vec<Comment>> {
    Ok(core::reanchor_file(&root, &file)?)
}

#[tauri::command]
pub fn set_anchor(root: String, id: String, file: String, start: u32, end: u32) -> Result<Comment> {
    Ok(core::set_anchor(&root, &id, &file, start, end)?)
}
