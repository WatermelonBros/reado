use super::routes::ProjectQuery;
use super::Api;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use reado_core::{self as core, ArtifactState, CommentKind, FileState};
use serde::Deserialize;
use tauri::Emitter;

// ---- Guided Pair Review, from the phone -----------------------------------
//
// Reads + disposals (accept/edit/discard/set-file) hit `.reado/sessions/` on disk
// directly via reado-core — no desktop needed; the desktop's watcher reflects
// them. Agent actions (start/review/respond/second-opinion/send) are dispatched
// to the hosting desktop via a `anywhere://review-action` event, since the agent
// runs there.

pub(super) async fn sessions_get(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<core::Session>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(core::list_sessions(&root)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ProposalBody {
    project: String,
    id: String,
    proposal: String,
    #[serde(default)]
    note: bool,
}

pub(super) async fn session_accept(
    State(api): State<Api>,
    Json(b): Json<ProposalBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let kind = if b.note {
        CommentKind::Note
    } else {
        CommentKind::Task
    };
    core::accept_proposal(&root, &b.id, &b.proposal, kind)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub(super) async fn session_discard(
    State(api): State<Api>,
    Json(b): Json<ProposalBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    core::set_proposal_state(&root, &b.id, &b.proposal, ArtifactState::Discarded, None)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileStateBody {
    project: String,
    id: String,
    file: String,
    state: FileState,
}

pub(super) async fn session_set_file(
    State(api): State<Api>,
    Json(b): Json<FileStateBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    core::set_file_state(&root, &b.id, &b.file, b.state)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReviewActionBody {
    project: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    file: String,
    /// One of: start | file | respond | challenge | send.
    action: String,
    #[serde(default)]
    objective: Option<String>,
}

/// Dispatch an agent action to the hosting desktop (the agent runs there). The
/// desktop window for this project performs it via its guided-review store.
pub(super) async fn review_action(
    State(api): State<Api>,
    Json(b): Json<ReviewActionBody>,
) -> StatusCode {
    let Some(root) = api.root(&b.project) else {
        return StatusCode::NOT_FOUND;
    };
    let payload = serde_json::json!({
        "root": root,
        "id": b.id,
        "file": b.file,
        "action": b.action,
        "objective": b.objective,
    });
    let _ = api.app.emit("anywhere://review-action", payload);
    StatusCode::OK
}
