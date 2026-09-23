use super::{AgentMirror, Api, Notice, ProjectMeta, RecentMeta};
use crate::proc::command;
use std::path::{Path, PathBuf};

use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::Json;
use reado_core::{self as core, CommentKind, CommentType, NewComment, Scope};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// Join a project-relative path to its root, confirming the result stays inside
/// it. An empty `rel` is allowed (it means the root itself).
///
/// Delegates to `fs::ensure_within` rather than checking for `..` itself: a bare
/// `..` check misses both absolute paths — `root.join("/etc/passwd")` discards
/// the base — and symlinks pointing out of the project. These routes are served
/// over the LAN, so this is the copy that can least afford to be the weak one.
fn safe_join(root: &str, rel: &str) -> Option<PathBuf> {
    crate::fs::ensure_within(Path::new(root), Path::new(rel)).ok()
}

// ---- API handlers ----------------------------------------------------------

pub(super) async fn list_projects(State(api): State<Api>) -> Json<Vec<ProjectMeta>> {
    let list = api
        .projects
        .lock()
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default();
    Json(list)
}

pub(super) async fn list_recents(State(api): State<Api>) -> Json<Vec<RecentMeta>> {
    let list = api.recents.lock().map(|r| r.clone()).unwrap_or_default();
    Json(list)
}

#[derive(Deserialize)]
pub(super) struct OpenBody {
    path: String,
}

/// Ask the desktop to open a project. Only paths already in the recents list are
/// allowed, so a paired phone can't make the desktop open arbitrary folders.
pub(super) async fn open_project(State(api): State<Api>, Json(b): Json<OpenBody>) -> StatusCode {
    let known = api
        .recents
        .lock()
        .map(|r| r.iter().any(|x| x.path == b.path))
        .unwrap_or(false);
    if !known {
        return StatusCode::FORBIDDEN;
    }
    let _ = api.app.emit("anywhere://open-project", b.path);
    StatusCode::OK
}

#[derive(Deserialize)]
pub(super) struct DirQuery {
    project: String,
    #[serde(default)]
    path: String,
}

#[derive(Serialize)]
pub(super) struct DirEntry {
    name: String,
    path: String,
    dir: bool,
}

pub(super) async fn dir(
    State(api): State<Api>,
    Query(q): Query<DirQuery>,
) -> Result<Json<Vec<DirEntry>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let base = safe_join(&root, &q.path).ok_or(StatusCode::BAD_REQUEST)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&base)
        .map_err(|_| StatusCode::NOT_FOUND)?
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let rel = if q.path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", q.path.trim_end_matches('/'), name)
        };
        out.push(DirEntry {
            name,
            path: rel,
            dir: is_dir,
        });
    }
    // Directories first, then files; each alphabetical (case-insensitive).
    out.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(Json(out))
}

#[derive(Deserialize)]
pub(super) struct FileQuery {
    project: String,
    path: String,
}

pub(super) async fn file(
    State(api): State<Api>,
    Query(q): Query<FileQuery>,
) -> Result<String, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let p = safe_join(&root, &q.path).ok_or(StatusCode::BAD_REQUEST)?;
    let meta = std::fs::metadata(&p).map_err(|_| StatusCode::NOT_FOUND)?;
    if meta.len() > 2_000_000 {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    std::fs::read_to_string(&p).map_err(|_| StatusCode::UNSUPPORTED_MEDIA_TYPE)
}

#[derive(Deserialize)]
pub(super) struct ProjectQuery {
    pub(super) project: String,
}

#[derive(Serialize)]
pub(super) struct ChangedFile {
    path: String,
    status: String,
}

/// Files changed vs HEAD (porcelain), so the phone can list them like the
/// desktop's git panel and open each one's diff.
pub(super) async fn changed(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<ChangedFile>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    // The same parse as the desktop's Source Control view: individual untracked
    // files (never a folder entry like `dir/`), unquoted paths, the new path of a
    // rename, and none of Reado's own files.
    let files = crate::git::status_entries(Path::new(&root))
        .unwrap_or_default()
        .into_iter()
        .map(|(code, path)| ChangedFile {
            status: code.trim().to_string(),
            path,
        })
        .collect();
    Ok(Json(files))
}

#[derive(Deserialize)]
pub(super) struct DiffQuery {
    project: String,
    #[serde(default)]
    path: String,
}

/// Unified diff vs HEAD — for one file when `path` is given, else the whole tree.
pub(super) async fn diff(
    State(api): State<Api>,
    Query(q): Query<DiffQuery>,
) -> Result<String, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    // Full-file context (huge -U) so the user can read the whole file, with the
    // changes highlighted inline — not just the changed hunks.
    let mut args = vec!["-C", &root, "diff", "--unified=100000", "HEAD"];
    if !q.path.is_empty() {
        if q.path.contains("..") {
            return Err(StatusCode::BAD_REQUEST);
        }
        args.push("--");
        args.push(&q.path);
    }
    let out = command("git")
        .args(&args)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub(super) async fn comments_get(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<core::Comment>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(core::list_comments(&root)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NewCommentBody {
    project: String,
    file: String,
    #[serde(default)]
    start_line: u32,
    #[serde(default)]
    end_line: u32,
    #[serde(rename = "type", default)]
    comment_type: Option<CommentType>,
    #[serde(default)]
    kind: Option<CommentKind>,
    body: String,
}

pub(super) async fn comments_post(
    State(api): State<Api>,
    Json(b): Json<NewCommentBody>,
) -> Result<Json<core::Comment>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let new = NewComment {
        file: b.file,
        scope: Scope::Range,
        start_line: b.start_line,
        end_line: if b.end_line == 0 {
            b.start_line
        } else {
            b.end_line
        },
        comment_type: b.comment_type.unwrap_or(CommentType::Note),
        kind: b.kind.unwrap_or(CommentKind::Task),
        body: b.body,
        context: Default::default(),
        url: None,
        x: None,
        y: None,
        target: None,
    };
    let created = core::create_comment(&root, new, "phone", None)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(created.comment))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateCommentBody {
    project: String,
    id: String,
    #[serde(default)]
    kind: Option<CommentKind>,
    #[serde(default)]
    state: Option<core::CommentState>,
}

/// Change a comment's kind (note ↔ task) and/or state (e.g. resolve) from the phone.
pub(super) async fn comment_update(
    State(api): State<Api>,
    Json(b): Json<UpdateCommentBody>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    if let Some(kind) = b.kind {
        let patch = core::CommentPatch {
            kind: Some(kind),
            ..Default::default()
        };
        core::update_comment(&root, &b.id, patch).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(state) = b.state {
        core::set_comment_state(&root, &b.id, state)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::OK)
}

/// The agent terminal's mirrored output. The phone polls this with the `seq` it
/// last saw; an unchanged `seq` means nothing new to draw.
pub(super) async fn agent_mirror_get(State(api): State<Api>) -> Json<AgentMirror> {
    Json(
        api.agent
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| AgentMirror::default()),
    )
}

#[derive(Deserialize)]
pub(super) struct AgentInput {
    data: String,
}

/// Keystrokes from the phone, forwarded to the desktop's agent terminal. The
/// desktop owns the PTY and does the write; this only carries the bytes, which
/// is what keeps a single writer on that terminal.
pub(super) async fn agent_input(State(api): State<Api>, Json(b): Json<AgentInput>) -> StatusCode {
    let _ = api.app.emit("anywhere://agent-input", b.data);
    StatusCode::OK
}

/// Recent notices for a paired phone. Bounded, so a phone that has been asleep
/// for an hour gets the tail rather than an unbounded backlog.
pub(super) async fn notices_get(State(api): State<Api>) -> Json<Vec<Notice>> {
    Json(api.notices.lock().map(|n| n.clone()).unwrap_or_default())
}

#[derive(Deserialize)]
pub(super) struct MarkReadBody {
    project: String,
    file: String,
    #[serde(default)]
    read: bool,
}

/// Mark a file read (or unread) from the phone. Reading progress lives in
/// `.reado/`, so this writes the same store the desktop does.
pub(super) async fn mark_read(
    State(api): State<Api>,
    Json(b): Json<MarkReadBody>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    // No content snapshot from the phone: the read-delta baseline should be the
    // bytes the reader actually saw, and the phone renders its own rendition.
    crate::progress::set_read(root, b.file, b.read, None)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

/// The AI pre-review's draft comments, so the phone can curate them. The store is
/// the same `.reado/pre-review.json` the desktop panel reads.
pub(super) async fn prereview_drafts(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let path = Path::new(&root).join(".reado").join("pre-review.json");
    let text = std::fs::read_to_string(path).unwrap_or_else(|_| "[]".into());
    Ok(Json(
        serde_json::from_str(&text).unwrap_or(serde_json::Value::Array(vec![])),
    ))
}

#[derive(Deserialize)]
pub(super) struct DraftDecision {
    project: String,
    id: String,
    /// True to turn the draft into a real anchored comment, false to discard it.
    approve: bool,
}

/// Approve or discard one pre-review draft. Approving materialises a real
/// anchored task comment — the same thing the desktop's Approve button does —
/// and either way the draft leaves the store.
pub(super) async fn prereview_approve(
    State(api): State<Api>,
    Json(b): Json<DraftDecision>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let path = Path::new(&root).join(".reado").join("pre-review.json");
    let text = std::fs::read_to_string(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let drafts: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    let Some(draft) = drafts
        .iter()
        .find(|d| d.get("id").and_then(|v| v.as_str()) == Some(b.id.as_str()))
    else {
        return Err(StatusCode::NOT_FOUND);
    };

    if b.approve {
        let file = draft
            .get("file")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let line = draft.get("line").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
        let body = draft
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let comment_type = draft
            .get("type")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or(CommentType::Note);
        core::create_comment(
            &root,
            NewComment {
                file,
                scope: Scope::Range,
                start_line: line.max(1),
                end_line: line.max(1),
                comment_type,
                kind: CommentKind::Task,
                body,
                context: core::Context::default(),
                url: None,
                x: None,
                y: None,
                target: None,
            },
            "human",
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let remaining: Vec<_> = drafts
        .into_iter()
        .filter(|d| d.get("id").and_then(|v| v.as_str()) != Some(b.id.as_str()))
        .collect();
    let out = serde_json::to_string_pretty(&remaining).unwrap_or_else(|_| "[]".into());
    std::fs::write(&path, out).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

/// Emit a desktop event so the focused window dispatches the agent / pre-review.
fn signal(api: &Api, event: &str, root: String) -> StatusCode {
    let _ = api.app.emit(event, root);
    StatusCode::OK
}

pub(super) async fn run_agent(State(api): State<Api>, Json(q): Json<ProjectQuery>) -> StatusCode {
    match api.root(&q.project) {
        Some(root) => signal(&api, "anywhere://run-agent", root),
        None => StatusCode::NOT_FOUND,
    }
}

pub(super) async fn prereview(State(api): State<Api>, Json(q): Json<ProjectQuery>) -> StatusCode {
    match api.root(&q.project) {
        Some(root) => signal(&api, "anywhere://prereview", root),
        None => StatusCode::NOT_FOUND,
    }
}

/// The current resolve-loop state for a paired phone to poll. `{}` when no loop
/// is active. The desktop publishes it via `anywhere_publish_loop`; this
/// capability only carries it (delivery is Anywhere's job).
pub(super) async fn loop_get(State(api): State<Api>) -> impl axum::response::IntoResponse {
    let body = api
        .loop_state
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_else(|| "{}".to_string());
    ([(header::CONTENT_TYPE, "application/json")], body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_confines_to_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();

        // What the route is for.
        assert!(safe_join(root.to_str().unwrap(), "src/main.rs").is_some());
        assert!(safe_join(root.to_str().unwrap(), "").is_some());

        // Traversal, in each of the three shapes that reach these handlers.
        assert!(safe_join(root.to_str().unwrap(), "../etc/passwd").is_none());
        // An absolute path: `join` discards the root, so a `..`-only check
        // waves this through.
        assert!(safe_join(root.to_str().unwrap(), "/etc/hosts").is_none());
        // A symlink pointing out of the project resolves outside it.
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc/hosts", root.join("escape")).unwrap();
            assert!(safe_join(root.to_str().unwrap(), "escape").is_none());
        }
    }
}
