//! Tauri command wrappers over the shared annotation store (`reado-core`).
//!
//! All comment model and on-disk logic lives in `reado_core`, shared with the
//! `reado` CLI. This module only adapts those functions to the Tauri command
//! boundary (string roots in, JSON out, errors mapped to the app error type).

use reado_core::{self as core, Comment, CommentPatch, CommentState, CreateResult, NewComment};

use crate::error::Result;

#[tauri::command]
pub fn create_comment(root: String, input: NewComment) -> Result<CreateResult> {
    let file = input.file.clone();
    // Comments created from the desktop UI are authored by the user.
    let result = core::create_comment(&root, input, "user", None)?;
    crate::log::info(
        "annotations",
        "comment created",
        serde_json::json!({ "file": file }),
    );
    Ok(result)
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
    let state_val = serde_json::to_value(state).unwrap_or(serde_json::Value::Null);
    let result = core::set_comment_state(&root, &id, state)?;
    crate::log::info(
        "annotations",
        "comment state changed",
        serde_json::json!({ "id": id, "state": state_val }),
    );
    Ok(result)
}

#[tauri::command]
pub fn delete_comment(root: String, id: String) -> Result<()> {
    core::delete_comment(&root, &id)?;
    crate::log::info(
        "annotations",
        "comment deleted",
        serde_json::json!({ "id": id }),
    );
    Ok(())
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
    core::write_config(&root, &json).inspect_err(|e| {
        crate::log::error(
            "annotations",
            "write project config failed",
            serde_json::json!({ "error": e.to_string() }),
        );
    })?;
    Ok(())
}

#[tauri::command]
pub fn reanchor_file(root: String, file: String) -> Result<Vec<Comment>> {
    let comments = core::reanchor_file(&root, &file)?;
    crate::log::debug(
        "annotations",
        "reanchored",
        serde_json::json!({ "file": file, "comments": comments.len() }),
    );
    Ok(comments)
}

#[tauri::command]
pub fn set_anchor(root: String, id: String, file: String, start: u32, end: u32) -> Result<Comment> {
    Ok(core::set_anchor(&root, &id, &file, start, end)?)
}
