//! Tauri command wrappers over the guided-review session store (`reado-core`).
//!
//! Like `annotations`, this is a thin adapter: all session model and on-disk
//! logic lives in `reado_core` (shared with the `reado` CLI the agent drives).
//! The desktop authors disposals (accept/discard/decision) as the user; the
//! agent authors proposals through the CLI.

use reado_core::{
    self as core, ArtifactState, CommentKind, FileState, NewSession, Proposal, Session,
};

use crate::error::Result;

#[tauri::command]
pub fn session_create(root: String, input: NewSession) -> Result<Session> {
    // Sessions started from the desktop are attributed to the user until the
    // agent takes over planning through the CLI.
    Ok(core::create_session(&root, input, None)?)
}

#[tauri::command]
pub fn session_list(root: String) -> Result<Vec<Session>> {
    Ok(core::list_sessions(&root))
}

#[tauri::command]
pub fn session_get(root: String, id: String) -> Result<Session> {
    Ok(core::get_session(&root, &id)?)
}

#[tauri::command]
pub fn session_set_file_state(
    root: String,
    id: String,
    file: String,
    state: FileState,
) -> Result<Session> {
    Ok(core::set_file_state(&root, &id, &file, state)?)
}

#[tauri::command]
pub fn session_set_position(root: String, id: String, index: usize) -> Result<Session> {
    Ok(core::set_position(&root, &id, index)?)
}

#[tauri::command]
pub fn session_accept_proposal(
    root: String,
    id: String,
    proposal: String,
    kind: CommentKind,
) -> Result<Session> {
    Ok(core::accept_proposal(&root, &id, &proposal, kind)?)
}

#[tauri::command]
pub fn session_set_proposal_state(
    root: String,
    id: String,
    proposal: String,
    state: ArtifactState,
    body: Option<String>,
) -> Result<Session> {
    Ok(core::set_proposal_state(
        &root, &id, &proposal, state, body,
    )?)
}

#[tauri::command]
pub fn session_add_decision(
    root: String,
    id: String,
    text: String,
    file: String,
) -> Result<Proposal> {
    Ok(core::add_decision(&root, &id, text, &file)?)
}

#[tauri::command]
pub fn session_set_file_summary(
    root: String,
    id: String,
    file: String,
    text: String,
) -> Result<Session> {
    Ok(core::set_file_summary(&root, &id, &file, text)?)
}

#[tauri::command]
pub fn session_set_summary(root: String, id: String, text: String) -> Result<Session> {
    Ok(core::set_session_summary(&root, &id, text)?)
}

#[tauri::command]
pub fn session_close(root: String, id: String) -> Result<Session> {
    Ok(core::close_session(&root, &id)?)
}

#[tauri::command]
pub fn session_delete(root: String, id: String) -> Result<()> {
    Ok(core::delete_session(&root, &id)?)
}
