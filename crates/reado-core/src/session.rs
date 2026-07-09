//! Guided Pair Review sessions — the orchestration layer above comments.
//!
//! A session is the durable, resumable record of a guided review: the chosen
//! scope and objective, the LLM-proposed route, per-file status, the artifacts
//! the agent proposes (comments, tasks, notes, questions, decisions, summaries),
//! and the running summaries. It is the **bridge the agent drives** through the
//! `reado session` / `reado review` CLI — Reado never calls an LLM directly, so
//! everything the agent emits lands here as structured data the desktop renders.
//!
//! Each session is a single JSON file under `.reado/sessions/<id>.json`. Comments
//! stay the durable artifact: accepting a proposal *materialises* a real
//! `.reado/comments/` entry via [`crate::create_comment`] and links it back to
//! the proposal, so the session never duplicates the comment store.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    create_comment, gen_id, now_millis, CommentKind, CommentType, Context, Error, NewComment,
    Result, Scope,
};

// ---- Domain types --------------------------------------------------------

/// What the review is scoped to. Mirrors the spec's scope sources.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScopeKind {
    /// The current uncommitted diff (working tree vs HEAD).
    Diff,
    /// The current branch vs a base branch (e.g. `main`).
    Branch,
    /// A folder subtree.
    Folder,
    /// An explicit set of files.
    Files,
    /// The project's open tasks/comments.
    Comments,
    /// The whole project, sampled progressively.
    Project,
    /// A hosted pull/merge request (supplied by the pull-request-review adapter).
    Pr,
    /// A free-text review request: the user describes what to review and the
    /// planner works out the relevant files itself (the `request` field carries
    /// the description). Still a full guided-review session, not a one-off.
    Prompt,
}

/// The optional focus that shapes the LLM's attention.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Objective {
    BugRisk,
    Design,
    Maintainability,
    Security,
    Performance,
    TestCoverage,
    AiSanity,
    Onboarding,
    General,
}

/// How deeply a file should be reviewed — the planner's `suggested_review_mode`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewMode {
    Quick,
    Normal,
    Deep,
}

/// Per-file progress through the review.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileState {
    NotStarted,
    Queued,
    InReview,
    Reviewed,
    NeedsFollowup,
    Skipped,
    Blocked,
    OutOfScope,
}

/// Whole-session lifecycle.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Planning,
    InReview,
    Done,
}

/// The distinct *kinds* of artifact a session records (beyond a comment's
/// lifecycle state). Faithful to the PDF's artifact list.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactType {
    Comment,
    Task,
    Note,
    Question,
    Decision,
    FollowUp,
    NeedsContext,
    FalsePositive,
    FileSummary,
    SessionSummary,
}

/// The lifecycle state of a proposed artifact, independent of the durable
/// comment state. A discarded/false-positive proposal stays as session memory.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactState {
    Proposed,
    Accepted,
    Edited,
    Discarded,
    ConvertedToTask,
    ConvertedToNote,
    ResolvedAsFalsePositive,
}

/// What the review covers. `base` applies to `branch`; `paths` to folder/files.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewScope {
    pub kind: ScopeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paths: Vec<String>,
    /// Free-form ref for a PR/MR scope (e.g. `#123`), set by the forge adapter.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr: Option<String>,
    /// The user's free-text request for a `prompt` scope (what to review).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<String>,
}

/// One ordered step in the proposed route, ranked by the planner.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteEntry {
    pub file: String,
    #[serde(default)]
    pub priority: u32,
    #[serde(default)]
    pub reason: String,
    #[serde(default = "default_mode")]
    pub suggested_review_mode: ReviewMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub related_files: Vec<String>,
}

fn default_mode() -> ReviewMode {
    ReviewMode::Normal
}

/// Per-file status plus its running mini-summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub file: String,
    pub state: FileState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

/// A proposed artifact the human disposes of. Comments/tasks/notes carry an
/// anchor; decisions/questions/summaries are free-form session memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub id: String,
    #[serde(rename = "artifactType")]
    pub artifact_type: ArtifactType,
    pub state: ArtifactState,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub file: String,
    #[serde(default)]
    pub start_line: u32,
    #[serde(default)]
    pub end_line: u32,
    /// Comment type for anchored proposals (bug/refactor/…); `None` otherwise.
    #[serde(default, rename = "type", skip_serializing_if = "Option::is_none")]
    pub comment_type: Option<CommentType>,
    pub body: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// The durable comment created when this proposal was accepted, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// The full session document persisted under `.reado/sessions/`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub scope: ReviewScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<Objective>,
    pub status: SessionStatus,
    /// Index into `route` of the file currently under review.
    #[serde(default)]
    pub position: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub route: Vec<RouteEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<FileEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub proposals: Vec<Proposal>,
    /// The session-level recap, set on summarize/close.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Input for starting a session.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSession {
    pub title: String,
    pub scope: ReviewScope,
    #[serde(default)]
    pub objective: Option<Objective>,
}

/// Input for a proposed artifact (the agent's `propose-*` calls).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProposal {
    pub artifact_type: ArtifactType,
    #[serde(default)]
    pub file: String,
    #[serde(default)]
    pub start_line: u32,
    #[serde(default)]
    pub end_line: u32,
    #[serde(default, rename = "type")]
    pub comment_type: Option<CommentType>,
    pub body: String,
}

// ---- Paths ---------------------------------------------------------------

fn sessions_dir(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("sessions")
}

/// A session id is safe to use as a filename: non-empty and free of path
/// separators or traversal, so a caller-supplied id can't escape `sessions/`.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && !id.contains('/') && !id.contains('\\') && !id.contains("..")
}

fn session_path(root: &str, id: &str) -> PathBuf {
    sessions_dir(root).join(format!("{id}.json"))
}

fn save(root: &str, session: &Session) -> Result<()> {
    let dir = sessions_dir(root);
    std::fs::create_dir_all(&dir)?;
    let json = serde_json::to_string_pretty(session).map_err(|e| Error::Json(e.to_string()))?;
    // Atomic write: a partial `std::fs::write` could be read mid-flight by
    // get_session/list_sessions as truncated JSON (and silently dropped). Write a
    // sibling temp file, then rename it into place (atomic on the same volume).
    let final_path = session_path(root, &session.id);
    let tmp = dir.join(format!(".{}.tmp", session.id));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

// ---- Store operations ----------------------------------------------------

/// Start a new guided review session for `scope`, authored by `agent`.
pub fn create_session(root: &str, input: NewSession, agent: Option<String>) -> Result<Session> {
    let now = now_millis();
    let session = Session {
        id: gen_id("s"),
        title: input.title,
        scope: input.scope,
        objective: input.objective,
        status: SessionStatus::Planning,
        position: 0,
        route: Vec::new(),
        files: Vec::new(),
        proposals: Vec::new(),
        summary: None,
        agent,
        created_at: now,
        updated_at: now,
    };
    save(root, &session)?;
    Ok(session)
}

/// All sessions, newest first.
pub fn list_sessions(root: &str) -> Vec<Session> {
    let Ok(entries) = std::fs::read_dir(sessions_dir(root)) else {
        return Vec::new();
    };
    let mut sessions: Vec<Session> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .filter_map(|p| std::fs::read_to_string(&p).ok())
        .filter_map(|s| serde_json::from_str::<Session>(&s).ok())
        .collect();
    sessions.sort_by_key(|s| std::cmp::Reverse(s.created_at));
    sessions
}

/// Fetch a session by id. Rejects ids that aren't safe filenames so a
/// caller-supplied id can't read outside `.reado/sessions/`.
pub fn get_session(root: &str, id: &str) -> Result<Session> {
    if !valid_id(id) {
        return Err(Error::NotFound(id.to_string()));
    }
    let text = std::fs::read_to_string(session_path(root, id))
        .map_err(|_| Error::NotFound(id.to_string()))?;
    serde_json::from_str(&text).map_err(|e| Error::Json(e.to_string()))
}

/// Read-modify-write a session, stamping `updated_at`.
fn mutate(root: &str, id: &str, f: impl FnOnce(&mut Session)) -> Result<Session> {
    let mut session = get_session(root, id)?;
    f(&mut session);
    session.updated_at = now_millis();
    save(root, &session)?;
    Ok(session)
}

/// Replace the proposed route and seed per-file entries for any new files.
/// Setting a route moves the session from planning to in-review.
pub fn set_route(root: &str, id: &str, route: Vec<RouteEntry>) -> Result<Session> {
    mutate(root, id, |s| {
        for entry in &route {
            if !s.files.iter().any(|f| f.file == entry.file) {
                s.files.push(FileEntry {
                    file: entry.file.clone(),
                    state: FileState::Queued,
                    summary: None,
                });
            }
        }
        s.route = route;
        // Keep the cursor in range: a shorter new route must not leave position
        // past the end, or `route[position]` panics in consumers (the UI/CLI).
        s.position = s.position.min(s.route.len().saturating_sub(1));
        if s.status == SessionStatus::Planning {
            s.status = SessionStatus::InReview;
        }
    })
}

/// Move the cursor to a specific route index (clamped). Used when the human
/// picks a file to focus, so `position` stays the single source of truth shared
/// with the agent's `reado review next`.
pub fn set_position(root: &str, id: &str, index: usize) -> Result<Session> {
    mutate(root, id, |s| {
        if !s.route.is_empty() {
            s.position = index.min(s.route.len() - 1);
        }
    })
}

/// Set a file's review state, creating its entry if missing.
pub fn set_file_state(root: &str, id: &str, file: &str, state: FileState) -> Result<Session> {
    mutate(root, id, |s| {
        match s.files.iter_mut().find(|f| f.file == file) {
            Some(entry) => entry.state = state,
            None => s.files.push(FileEntry {
                file: file.to_string(),
                state,
                summary: None,
            }),
        }
    })
}

/// Move the cursor to the next not-yet-finished route entry and return the
/// session. The frontend/agent reads `position` to know where to go.
pub fn advance(root: &str, id: &str) -> Result<Session> {
    mutate(root, id, |s| {
        let done = |st: FileState| {
            matches!(
                st,
                FileState::Reviewed | FileState::Skipped | FileState::OutOfScope
            )
        };
        let next = s.route.iter().enumerate().find(|(_, e)| {
            s.files
                .iter()
                .find(|f| f.file == e.file)
                .map(|f| !done(f.state))
                .unwrap_or(true)
        });
        if let Some((idx, _)) = next {
            s.position = idx;
        } else if !s.route.is_empty() {
            s.position = s.route.len() - 1;
        }
    })
}

/// Record a proposed artifact emitted by the agent (or the user).
pub fn add_proposal(
    root: &str,
    id: &str,
    input: NewProposal,
    author: &str,
    agent: Option<String>,
) -> Result<Proposal> {
    let now = now_millis();
    let proposal = Proposal {
        id: gen_id("p"),
        artifact_type: input.artifact_type,
        state: ArtifactState::Proposed,
        file: input.file,
        start_line: input.start_line,
        end_line: input.end_line.max(input.start_line),
        comment_type: input.comment_type,
        body: input.body,
        author: author.to_string(),
        agent,
        comment_id: None,
        created_at: now,
        updated_at: now,
    };
    let stored = proposal.clone();
    mutate(root, id, |s| s.proposals.push(proposal))?;
    Ok(stored)
}

/// Accept a proposal: materialise a durable anchored comment (when the proposal
/// is anchored) and mark the proposal accepted, linking it to the new comment.
/// `kind` decides whether the durable artifact is a task or a note.
pub fn accept_proposal(
    root: &str,
    id: &str,
    proposal_id: &str,
    kind: CommentKind,
) -> Result<Session> {
    let session = get_session(root, id)?;
    let proposal = session
        .proposals
        .iter()
        .find(|p| p.id == proposal_id)
        .ok_or_else(|| Error::NotFound(proposal_id.to_string()))?
        .clone();

    // Idempotent: a second accept (double-click / retry) must not create a second
    // durable comment and orphan the first. If it's already accepted, no-op.
    if matches!(
        proposal.state,
        ArtifactState::Accepted | ArtifactState::ConvertedToTask | ArtifactState::ConvertedToNote
    ) {
        return Ok(session);
    }

    // Anchored proposals become real comments; pure session memory (decision,
    // question, summaries) is just marked accepted in place.
    let comment_id = if !proposal.file.is_empty() {
        let created = create_comment(
            root,
            NewComment {
                file: proposal.file.clone(),
                scope: if proposal.start_line > 0 {
                    Scope::Range
                } else {
                    Scope::File
                },
                start_line: proposal.start_line,
                end_line: proposal.end_line,
                comment_type: proposal.comment_type.unwrap_or(CommentType::Note),
                kind,
                body: proposal.body.clone(),
                context: Context::default(),
            },
            proposal.author.as_str(),
            proposal.agent.clone(),
        )?;
        Some(created.comment.meta.id)
    } else {
        None
    };

    let new_state = match kind {
        CommentKind::Task => ArtifactState::ConvertedToTask,
        CommentKind::Note => ArtifactState::ConvertedToNote,
    };

    mutate(root, id, |s| {
        if let Some(p) = s.proposals.iter_mut().find(|p| p.id == proposal_id) {
            p.state = new_state;
            p.comment_id = comment_id;
            p.updated_at = now_millis();
        }
    })
}

/// Set a proposal's state directly (edit / discard / resolve-as-false-positive).
/// Discarded and false-positive proposals are kept as session memory.
pub fn set_proposal_state(
    root: &str,
    id: &str,
    proposal_id: &str,
    state: ArtifactState,
    body: Option<String>,
) -> Result<Session> {
    mutate(root, id, |s| {
        if let Some(p) = s.proposals.iter_mut().find(|p| p.id == proposal_id) {
            p.state = state;
            if let Some(b) = body {
                p.body = b;
            }
            p.updated_at = now_millis();
        }
    })
}

/// Record a session decision (e.g. "intentional debt, leave it") as its own
/// artifact — distinct from a comment, surviving in session memory. A decision
/// is final the moment it's made, so it persists as `accepted`.
pub fn add_decision(root: &str, id: &str, text: String, file: &str) -> Result<Proposal> {
    let p = add_proposal(
        root,
        id,
        NewProposal {
            artifact_type: ArtifactType::Decision,
            file: file.to_string(),
            start_line: 0,
            end_line: 0,
            comment_type: None,
            body: text,
        },
        "user",
        None,
    )?;
    set_proposal_state(root, id, &p.id, ArtifactState::Accepted, None)?;
    Ok(Proposal {
        state: ArtifactState::Accepted,
        ..p
    })
}

/// Set a file's running mini-summary.
pub fn set_file_summary(root: &str, id: &str, file: &str, text: String) -> Result<Session> {
    mutate(root, id, |s| {
        match s.files.iter_mut().find(|f| f.file == file) {
            Some(entry) => entry.summary = Some(text),
            None => s.files.push(FileEntry {
                file: file.to_string(),
                state: FileState::Reviewed,
                summary: Some(text),
            }),
        }
    })
}

/// Set the session-level recap.
pub fn set_session_summary(root: &str, id: &str, text: String) -> Result<Session> {
    mutate(root, id, |s| s.summary = Some(text))
}

/// Close a session (sets status to done; the file stays for resume/history).
pub fn close_session(root: &str, id: &str) -> Result<Session> {
    mutate(root, id, |s| s.status = SessionStatus::Done)
}

/// Delete a session entirely (a reset/discard — the record is removed). Its
/// accepted artifacts already live in the comment store and are untouched.
pub fn delete_session(root: &str, id: &str) -> Result<()> {
    if !valid_id(id) {
        return Err(Error::NotFound(id.to_string()));
    }
    std::fs::remove_file(session_path(root, id)).map_err(|_| Error::NotFound(id.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diff_scope() -> ReviewScope {
        ReviewScope {
            kind: ScopeKind::Diff,
            base: None,
            paths: vec![],
            pr: None,
            request: None,
        }
    }

    fn start(root: &str) -> Session {
        create_session(
            root,
            NewSession {
                title: "Review the diff".into(),
                scope: diff_scope(),
                objective: Some(Objective::BugRisk),
            },
            Some("claude-code".into()),
        )
        .unwrap()
    }

    #[test]
    fn prompt_scope_persists_its_request() {
        // A free-text review request is a real session scope (not a one-off): the
        // request round-trips through the on-disk session, and a scope without a
        // request (older sessions) still deserializes.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = create_session(
            root,
            NewSession {
                title: "Review as requested".into(),
                scope: ReviewScope {
                    kind: ScopeKind::Prompt,
                    base: None,
                    paths: vec![],
                    pr: None,
                    request: Some("evaluate the test suite".into()),
                },
                objective: None,
            },
            Some("claude-code".into()),
        )
        .unwrap();
        let got = get_session(root, &s.id).unwrap();
        assert_eq!(got.scope.kind, ScopeKind::Prompt);
        assert_eq!(
            got.scope.request.as_deref(),
            Some("evaluate the test suite")
        );

        // A legacy scope JSON with no `request` field still parses.
        let legacy: ReviewScope = serde_json::from_str(r#"{"kind":"prompt"}"#).unwrap();
        assert_eq!(legacy.kind, ScopeKind::Prompt);
        assert!(legacy.request.is_none());
    }

    #[test]
    fn create_list_get_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        assert_eq!(s.status, SessionStatus::Planning);
        assert_eq!(list_sessions(root).len(), 1);
        let got = get_session(root, &s.id).unwrap();
        assert_eq!(got.id, s.id);
        assert_eq!(got.objective, Some(Objective::BugRisk));
    }

    #[test]
    fn route_seeds_files_and_enters_review() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        let updated = set_route(
            root,
            &s.id,
            vec![
                RouteEntry {
                    file: "src/a.rs".into(),
                    priority: 1,
                    reason: "core logic changed".into(),
                    suggested_review_mode: ReviewMode::Deep,
                    related_files: vec!["src/b.rs".into()],
                },
                RouteEntry {
                    file: "src/b.rs".into(),
                    priority: 2,
                    reason: "helper".into(),
                    suggested_review_mode: ReviewMode::Quick,
                    related_files: vec![],
                },
            ],
        )
        .unwrap();
        assert_eq!(updated.status, SessionStatus::InReview);
        assert_eq!(updated.route.len(), 2);
        assert_eq!(updated.files.len(), 2);
        assert!(updated.files.iter().all(|f| f.state == FileState::Queued));
    }

    #[test]
    fn advance_skips_finished_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        set_route(
            root,
            &s.id,
            vec![
                RouteEntry {
                    file: "a".into(),
                    priority: 1,
                    reason: String::new(),
                    suggested_review_mode: ReviewMode::Normal,
                    related_files: vec![],
                },
                RouteEntry {
                    file: "b".into(),
                    priority: 2,
                    reason: String::new(),
                    suggested_review_mode: ReviewMode::Normal,
                    related_files: vec![],
                },
            ],
        )
        .unwrap();
        set_file_state(root, &s.id, "a", FileState::Reviewed).unwrap();
        let advanced = advance(root, &s.id).unwrap();
        assert_eq!(advanced.position, 1); // skipped the reviewed "a"
    }

    #[test]
    fn accept_proposal_materialises_a_comment() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.rs"), "fn main() {}\n").unwrap();
        let s = start(root);
        let p = add_proposal(
            root,
            &s.id,
            NewProposal {
                artifact_type: ArtifactType::Comment,
                file: "a.rs".into(),
                start_line: 1,
                end_line: 1,
                comment_type: Some(CommentType::Bug),
                body: "off-by-one here".into(),
            },
            "agent",
            Some("claude-code".into()),
        )
        .unwrap();
        assert_eq!(p.state, ArtifactState::Proposed);

        let updated = accept_proposal(root, &s.id, &p.id, CommentKind::Task).unwrap();
        let accepted = updated.proposals.iter().find(|x| x.id == p.id).unwrap();
        assert_eq!(accepted.state, ArtifactState::ConvertedToTask);
        assert!(accepted.comment_id.is_some());
        // A durable comment now exists.
        assert_eq!(crate::list_comments(root).len(), 1);
    }

    #[test]
    fn discarded_proposal_stays_as_memory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        let p = add_proposal(
            root,
            &s.id,
            NewProposal {
                artifact_type: ArtifactType::Comment,
                file: "a.rs".into(),
                start_line: 1,
                end_line: 1,
                comment_type: Some(CommentType::Question),
                body: "is this intentional?".into(),
            },
            "agent",
            None,
        )
        .unwrap();
        let updated = set_proposal_state(
            root,
            &s.id,
            &p.id,
            ArtifactState::ResolvedAsFalsePositive,
            Some("checked — fine because convention X".into()),
        )
        .unwrap();
        // No durable comment created, but the proposal survives.
        assert_eq!(crate::list_comments(root).len(), 0);
        assert_eq!(updated.proposals.len(), 1);
        assert_eq!(
            updated.proposals[0].state,
            ArtifactState::ResolvedAsFalsePositive
        );
    }

    #[test]
    fn decisions_and_summaries_persist() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        add_decision(root, &s.id, "intentional debt, leave it".into(), "a.rs").unwrap();
        set_file_summary(root, &s.id, "a.rs", "checked error paths".into()).unwrap();
        let updated = set_session_summary(root, &s.id, "2 bugs, 1 decision".into()).unwrap();
        assert_eq!(updated.summary.as_deref(), Some("2 bugs, 1 decision"));
        let decision = updated
            .proposals
            .iter()
            .find(|p| p.artifact_type == ArtifactType::Decision)
            .unwrap();
        assert_eq!(decision.state, ArtifactState::Accepted);
        let file = updated.files.iter().find(|f| f.file == "a.rs").unwrap();
        assert_eq!(file.summary.as_deref(), Some("checked error paths"));
    }

    #[test]
    fn set_route_clamps_position_when_route_shrinks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        let entry = |f: &str| RouteEntry {
            file: f.into(),
            priority: 1,
            reason: String::new(),
            suggested_review_mode: ReviewMode::Normal,
            related_files: vec![],
        };
        set_route(root, &s.id, vec![entry("a"), entry("b"), entry("c")]).unwrap();
        set_position(root, &s.id, 2).unwrap(); // point at "c"
                                               // A shorter route must pull the cursor back in range, not leave it at 2.
        let updated = set_route(root, &s.id, vec![entry("a")]).unwrap();
        assert_eq!(updated.route.len(), 1);
        assert_eq!(updated.position, 0);
    }

    #[test]
    fn accept_proposal_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.rs"), "fn main() {}\n").unwrap();
        let s = start(root);
        let p = add_proposal(
            root,
            &s.id,
            NewProposal {
                artifact_type: ArtifactType::Comment,
                file: "a.rs".into(),
                start_line: 1,
                end_line: 1,
                comment_type: Some(CommentType::Bug),
                body: "bug".into(),
            },
            "agent",
            None,
        )
        .unwrap();
        accept_proposal(root, &s.id, &p.id, CommentKind::Task).unwrap();
        // A second accept must be a no-op: still exactly one durable comment.
        accept_proposal(root, &s.id, &p.id, CommentKind::Task).unwrap();
        assert_eq!(crate::list_comments(root).len(), 1);
    }

    #[test]
    fn rejects_traversal_ids() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(get_session(root, "../../etc/passwd").is_err());
        assert!(get_session(root, "a/b").is_err());
        assert!(get_session(root, "").is_err());
    }

    #[test]
    fn close_marks_done_but_keeps_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let s = start(root);
        close_session(root, &s.id).unwrap();
        assert_eq!(
            get_session(root, &s.id).unwrap().status,
            SessionStatus::Done
        );
    }
}
