//! Reado's annotation store — the shared comment model and on-disk format.
//!
//! Comments are durable, human- and AI-readable artifacts. Each is a single
//! `.md` file with YAML front-matter (metadata + anchor) and a Markdown body
//! holding the conversation thread; the `.md` files are the **source of truth**.
//!
//! This crate is shared by the Reado desktop app (Tauri command wrappers) and
//! the `reado` CLI (the stable contract the AI agent uses), so the on-disk
//! format and all mutation logic live in exactly one place.
//!
//! ## Layout (under the project root)
//! ```text
//! .reado/
//!   comments/   active comments (one <id>.md each)
//!   archive/    resolved comments, kept as consultable history
//! ```
//!
//! ## Thread encoding
//! The body starts with the root message; each reply is introduced by an HTML
//! comment marker so the file stays valid, readable Markdown yet machine-parseable:
//! ```text
//! The root comment.
//!
//! <!-- reado:reply author=agent agent=claude-code at=1718900000000 -->
//!
//! The agent's reply.
//! ```

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

mod session;
pub use session::*;

// ---- Errors --------------------------------------------------------------

/// Errors from store operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("YAML error: {0}")]
    Yaml(String),
    #[error("JSON error: {0}")]
    Json(String),
    #[error("no such comment: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, Error>;

// ---- Domain types --------------------------------------------------------

/// Fixed comment type. The set is intentionally closed.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommentType {
    Bug,
    Refactor,
    Performance,
    Question,
    Note,
}

/// Lifecycle state. `orphan` is a separate flag, not a state.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CommentState {
    Open,
    InProgress,
    Done,
    Discarded,
}

/// Whether a comment is an actionable task (eligible for the AI review batch)
/// or a passive note (excluded from the batch).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommentKind {
    Task,
    Note,
}

/// What a comment is anchored to.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Range,
    File,
    Project,
}

/// Where a comment lives in the code (an external overlay — never in the file).
///
/// Serialised in camelCase to match the TypeScript `Anchor`. The `alias`es keep
/// reading `.md` files written before this struct adopted camelCase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    /// Project-relative path with forward slashes (empty for project scope).
    pub file: String,
    pub scope: Scope,
    /// 1-based inclusive line range (ignored for file/project scope).
    #[serde(default, alias = "start_line")]
    pub start_line: u32,
    #[serde(default, alias = "end_line")]
    pub end_line: u32,
}

/// Adaptive snapshot of the anchored code, used to re-locate the anchor after
/// external edits.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Context {
    #[serde(default)]
    pub snippet: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub after: String,
}

/// YAML front-matter persisted at the top of each comment `.md`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub comment_type: CommentType,
    pub state: CommentState,
    pub kind: CommentKind,
    pub anchor: Anchor,
    #[serde(default)]
    pub context: Context,
    #[serde(default)]
    pub links: Vec<String>,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// The hosting forge a pulled review thread came from ("github"/"gitlab"),
    /// or `None` for a native Reado comment. Drives the inbox origin badge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    /// The host thread/discussion id, for resolution sync back to the forge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    /// The host change-request ref (PR/MR number) the thread belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_ref: Option<String>,
    #[serde(default)]
    pub orphan: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

/// One message in a comment thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub created_at: u64,
    pub body: String,
}

/// A full comment: metadata plus the parsed thread.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    #[serde(flatten)]
    pub meta: CommentMeta,
    pub messages: Vec<Message>,
    /// `true` when read from `archive/` rather than `comments/`.
    pub archived: bool,
}

/// Input for creating a comment.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComment {
    pub file: String,
    pub scope: Scope,
    #[serde(default)]
    pub start_line: u32,
    #[serde(default)]
    pub end_line: u32,
    #[serde(rename = "type")]
    pub comment_type: CommentType,
    pub kind: CommentKind,
    pub body: String,
    #[serde(default)]
    pub context: Context,
}

/// Result of creating a comment.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub comment: Comment,
    pub first_comment: bool,
}

/// Editable metadata fields. Any `None` field is left unchanged.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentPatch {
    #[serde(rename = "type")]
    pub comment_type: Option<CommentType>,
    pub kind: Option<CommentKind>,
    pub links: Option<Vec<String>>,
    pub body: Option<String>,
}

// ---- Paths & ids ---------------------------------------------------------

fn reado_dir(root: &str) -> PathBuf {
    Path::new(root).join(".reado")
}
fn comments_dir(root: &str) -> PathBuf {
    reado_dir(root).join("comments")
}
fn archive_dir(root: &str) -> PathBuf {
    reado_dir(root).join("archive")
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Generate a unique id with the given prefix (e.g. `c` for comments, `s` for
/// sessions, `p` for proposals). The counter is shared so ids never collide
/// within a process even at the same millisecond.
pub(crate) fn gen_id(prefix: &str) -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{:x}_{:x}", now_millis(), n)
}

fn new_id() -> String {
    gen_id("c")
}

// ---- Serialization to/from the `.md` format ------------------------------

const REPLY_PREFIX: &str = "<!-- reado:reply ";

fn to_markdown(meta: &CommentMeta, messages: &[Message]) -> Result<String> {
    let front = serde_yaml::to_string(meta).map_err(|e| Error::Yaml(e.to_string()))?;
    let mut out = format!("---\n{front}---\n\n");
    for (i, msg) in messages.iter().enumerate() {
        if i > 0 {
            let agent = msg
                .agent
                .as_deref()
                .map(|a| format!(" agent={a}"))
                .unwrap_or_default();
            out.push_str(&format!(
                "\n\n{REPLY_PREFIX}author={}{agent} at={} -->\n\n",
                msg.author, msg.created_at
            ));
        }
        out.push_str(msg.body.trim_end());
    }
    out.push('\n');
    Ok(out)
}

fn from_markdown(text: &str) -> Result<(CommentMeta, Vec<Message>)> {
    let rest = text
        .strip_prefix("---\n")
        .ok_or_else(|| Error::Yaml("missing front-matter".into()))?;
    let end = rest
        .find("\n---")
        .ok_or_else(|| Error::Yaml("unterminated front-matter".into()))?;
    let front = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['\n', '\r']);

    let meta: CommentMeta = serde_yaml::from_str(front).map_err(|e| Error::Yaml(e.to_string()))?;

    let mut messages = Vec::new();
    let mut current_author = meta.author.clone();
    let mut current_agent = meta.agent.clone();
    let mut current_time = meta.created_at;
    let mut buffer = String::new();

    let flush = |messages: &mut Vec<Message>,
                 author: &str,
                 agent: &Option<String>,
                 time: u64,
                 buf: &str| {
        let body = buf.trim().to_string();
        if !body.is_empty() || messages.is_empty() {
            messages.push(Message {
                author: author.to_string(),
                agent: agent.clone(),
                created_at: time,
                body,
            });
        }
    };

    for line in body.lines() {
        if let Some(attrs) = line.trim().strip_prefix(REPLY_PREFIX) {
            flush(
                &mut messages,
                &current_author,
                &current_agent,
                current_time,
                &buffer,
            );
            buffer.clear();
            let (author, agent, at) = parse_reply_attrs(attrs);
            current_author = author;
            current_agent = agent;
            current_time = at;
        } else {
            buffer.push_str(line);
            buffer.push('\n');
        }
    }
    flush(
        &mut messages,
        &current_author,
        &current_agent,
        current_time,
        &buffer,
    );

    Ok((meta, messages))
}

fn parse_reply_attrs(attrs: &str) -> (String, Option<String>, u64) {
    let mut author = "user".to_string();
    let mut agent = None;
    let mut at = 0;
    for token in attrs.trim_end_matches("-->").split_whitespace() {
        if let Some(v) = token.strip_prefix("author=") {
            author = v.to_string();
        } else if let Some(v) = token.strip_prefix("agent=") {
            agent = Some(v.to_string());
        } else if let Some(v) = token.strip_prefix("at=") {
            at = v.parse().unwrap_or(0);
        }
    }
    (author, agent, at)
}

// ---- Disk helpers --------------------------------------------------------

fn read_comment(path: &Path, archived: bool) -> Result<Comment> {
    let text = std::fs::read_to_string(path)?;
    let (meta, messages) = from_markdown(&text)?;
    Ok(Comment {
        meta,
        messages,
        archived,
    })
}

fn write_comment(dir: &Path, meta: &CommentMeta, messages: &[Message]) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{}.md", meta.id));
    std::fs::write(path, to_markdown(meta, messages)?)?;
    Ok(())
}

fn locate(root: &str, id: &str) -> Option<(PathBuf, bool)> {
    let active = comments_dir(root).join(format!("{id}.md"));
    if active.exists() {
        return Some((active, false));
    }
    let archived = archive_dir(root).join(format!("{id}.md"));
    if archived.exists() {
        return Some((archived, true));
    }
    None
}

fn dir_for(root: &str, archived: bool) -> PathBuf {
    if archived {
        archive_dir(root)
    } else {
        comments_dir(root)
    }
}

fn list_dir(dir: &Path, archived: bool) -> Vec<Comment> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut comments: Vec<Comment> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .filter_map(|p| read_comment(&p, archived).ok())
        .collect();
    comments.sort_by_key(|c| c.meta.created_at);
    comments
}

// ---- Store operations ----------------------------------------------------

/// Create a comment authored by `author` (e.g. "user" or "agent"), initialising
/// `.reado/` if needed. `first_comment` is true when this created `.reado/`.
pub fn create_comment(
    root: &str,
    input: NewComment,
    author: &str,
    agent: Option<String>,
) -> Result<CreateResult> {
    let first_comment = !reado_dir(root).exists();
    let now = now_millis();

    // Capture a context snapshot from the file if the caller didn't provide one
    // (the CLI doesn't). Without it, anchoring can't relocate the comment.
    let mut context = input.context;
    if context.snippet.is_empty() && input.scope == Scope::Range && !input.file.is_empty() {
        if let Ok(content) = std::fs::read_to_string(Path::new(root).join(&input.file)) {
            context = extract_context(&content, input.start_line, input.end_line);
        }
    }

    let meta = CommentMeta {
        id: new_id(),
        comment_type: input.comment_type,
        state: CommentState::Open,
        kind: input.kind,
        anchor: Anchor {
            file: input.file,
            scope: input.scope,
            start_line: input.start_line,
            end_line: input.end_line,
        },
        context,
        links: Vec::new(),
        author: author.to_string(),
        agent: agent.clone(),
        origin: None,
        external_id: None,
        external_ref: None,
        orphan: false,
        created_at: now,
        updated_at: now,
    };
    let messages = vec![Message {
        author: author.to_string(),
        agent,
        created_at: now,
        body: input.body,
    }];
    write_comment(&comments_dir(root), &meta, &messages)?;
    Ok(CreateResult {
        comment: Comment {
            meta,
            messages,
            archived: false,
        },
        first_comment,
    })
}

/// All active comments (from `comments/`).
pub fn list_comments(root: &str) -> Vec<Comment> {
    list_dir(&comments_dir(root), false)
}

/// All archived comments (from `archive/`), the consultable history.
pub fn list_archived(root: &str) -> Vec<Comment> {
    list_dir(&archive_dir(root), true)
}

/// Fetch a single comment by id (searches active then archive).
pub fn get_comment(root: &str, id: &str) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    read_comment(&path, archived)
}

/// Comments whose thread text or snippet contains `query` (case-insensitive).
pub fn search_comments(root: &str, query: &str) -> Vec<Comment> {
    let needle = query.to_lowercase();
    list_comments(root)
        .into_iter()
        .filter(|c| {
            c.messages
                .iter()
                .any(|m| m.body.to_lowercase().contains(&needle))
                || c.meta.context.snippet.to_lowercase().contains(&needle)
        })
        .collect()
}

/// Update a comment's metadata and/or root message body.
pub fn update_comment(root: &str, id: &str, patch: CommentPatch) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    let mut comment = read_comment(&path, archived)?;
    if let Some(v) = patch.comment_type {
        comment.meta.comment_type = v;
    }
    if let Some(v) = patch.kind {
        comment.meta.kind = v;
    }
    if let Some(v) = patch.links {
        comment.meta.links = v;
    }
    if let Some(v) = patch.body {
        if let Some(root_msg) = comment.messages.first_mut() {
            root_msg.body = v;
        }
    }
    comment.meta.updated_at = now_millis();
    write_comment(&dir_for(root, archived), &comment.meta, &comment.messages)?;
    Ok(comment)
}

/// Append a reply to a comment's thread.
pub fn add_reply(
    root: &str,
    id: &str,
    author: &str,
    agent: Option<String>,
    body: String,
) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    let mut comment = read_comment(&path, archived)?;
    comment.messages.push(Message {
        author: author.to_string(),
        agent,
        created_at: now_millis(),
        body,
    });
    comment.meta.updated_at = now_millis();
    write_comment(&dir_for(root, archived), &comment.meta, &comment.messages)?;
    Ok(comment)
}

/// Add a manual link from comment `id` to `target` (bidirectional is the
/// caller's choice; here we record one direction). Idempotent.
pub fn link_comments(root: &str, id: &str, target: &str) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    let mut comment = read_comment(&path, archived)?;
    if !comment.meta.links.iter().any(|l| l == target) {
        comment.meta.links.push(target.to_string());
        comment.meta.updated_at = now_millis();
        write_comment(&dir_for(root, archived), &comment.meta, &comment.messages)?;
    }
    Ok(comment)
}

/// Manually re-anchor a comment to a new file/range (used to resolve orphans).
/// Recomputes the context snapshot from the file and clears the orphan flag.
pub fn set_anchor(root: &str, id: &str, file: &str, start: u32, end: u32) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    let mut comment = read_comment(&path, archived)?;
    comment.meta.anchor.file = file.to_string();
    comment.meta.anchor.scope = Scope::Range;
    comment.meta.anchor.start_line = start;
    comment.meta.anchor.end_line = end.max(start);
    comment.meta.orphan = false;
    if let Ok(content) = std::fs::read_to_string(Path::new(root).join(file)) {
        comment.meta.context = extract_context(&content, start, end.max(start));
    }
    comment.meta.updated_at = now_millis();
    write_comment(&dir_for(root, archived), &comment.meta, &comment.messages)?;
    Ok(comment)
}

/// Set a comment's state. Transitioning to `done` archives the file
/// (`comments/` → `archive/`); leaving `done` restores it.
pub fn set_comment_state(root: &str, id: &str, state: CommentState) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    let mut comment = read_comment(&path, archived)?;
    comment.meta.state = state;
    comment.meta.updated_at = now_millis();

    let should_archive = state == CommentState::Done;
    if should_archive != archived {
        std::fs::remove_file(&path)?;
        write_comment(
            &dir_for(root, should_archive),
            &comment.meta,
            &comment.messages,
        )?;
        comment.archived = should_archive;
    } else {
        write_comment(&dir_for(root, archived), &comment.meta, &comment.messages)?;
    }
    Ok(comment)
}

/// Create or update a comment mirroring a host review thread, keyed by
/// `(origin, external_id)` so re-pulling a PR/MR is idempotent. A resolved host
/// thread maps to a `Done` comment (archived); reopening restores it. The body
/// is stored as the root message; the anchor follows the host's file/line.
#[allow(clippy::too_many_arguments)]
pub fn upsert_host_comment(
    root: &str,
    origin: &str,
    external_id: &str,
    external_ref: &str,
    file: &str,
    line: u32,
    author: &str,
    body: String,
    resolved: bool,
) -> Result<Comment> {
    let existing = list_comments(root)
        .into_iter()
        .chain(list_archived(root))
        .find(|c| {
            c.meta.origin.as_deref() == Some(origin)
                && c.meta.external_id.as_deref() == Some(external_id)
        });
    let now = now_millis();
    let want_done = resolved;

    let (mut meta, messages, was_archived) = match existing {
        Some(mut c) => {
            c.meta.anchor.file = file.to_string();
            c.meta.anchor.scope = if line > 0 { Scope::Range } else { Scope::File };
            c.meta.anchor.start_line = line;
            c.meta.anchor.end_line = line;
            if let Some(root_msg) = c.messages.first_mut() {
                root_msg.body = body.clone();
            }
            (c.meta, c.messages, c.archived)
        }
        None => {
            let meta = CommentMeta {
                id: new_id(),
                comment_type: CommentType::Note,
                state: CommentState::Open,
                kind: CommentKind::Note,
                anchor: Anchor {
                    file: file.to_string(),
                    scope: if line > 0 { Scope::Range } else { Scope::File },
                    start_line: line,
                    end_line: line,
                },
                context: Context::default(),
                links: Vec::new(),
                author: author.to_string(),
                agent: None,
                origin: Some(origin.to_string()),
                external_id: Some(external_id.to_string()),
                external_ref: Some(external_ref.to_string()),
                orphan: false,
                created_at: now,
                updated_at: now,
            };
            let messages = vec![Message {
                author: author.to_string(),
                agent: None,
                created_at: now,
                body: body.clone(),
            }];
            (meta, messages, false)
        }
    };

    meta.state = if want_done {
        CommentState::Done
    } else {
        CommentState::Open
    };
    meta.updated_at = now;

    // Place the file in the right store, moving it if resolution changed.
    if was_archived != want_done {
        let old = dir_for(root, was_archived).join(format!("{}.md", meta.id));
        let _ = std::fs::remove_file(old);
    }
    write_comment(&dir_for(root, want_done), &meta, &messages)?;
    Ok(Comment {
        meta,
        messages,
        archived: want_done,
    })
}

/// Update the stored path of every active comment anchored to `from` so it
/// points at `to` (used when the watcher reports a file rename/move).
pub fn rename_comments(root: &str, from: &str, to: &str) -> Result<usize> {
    let dir = comments_dir(root);
    let mut moved = 0;
    for mut comment in list_dir(&dir, false) {
        if comment.meta.anchor.file == from {
            comment.meta.anchor.file = to.to_string();
            comment.meta.updated_at = now_millis();
            write_comment(&dir, &comment.meta, &comment.messages)?;
            moved += 1;
        }
    }
    Ok(moved)
}

/// Delete a comment entirely (never archived — deletion is permanent).
pub fn delete_comment(root: &str, id: &str) -> Result<()> {
    let (path, _) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    std::fs::remove_file(path)?;
    Ok(())
}

/// Read the per-project config (`.reado/config.json`) as raw JSON, or `None`
/// when absent. Per-project settings override the user's global settings.
pub fn read_config(root: &str) -> Option<String> {
    std::fs::read_to_string(reado_dir(root).join("config.json")).ok()
}

/// Write the per-project config (`.reado/config.json`). `json` is stored verbatim.
pub fn write_config(root: &str, json: &str) -> Result<()> {
    let dir = reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("config.json"), json)?;
    Ok(())
}

/// Add `.reado/` (or just the index when versioning) to the project `.gitignore`.
/// Idempotent.
pub fn add_reado_gitignore(root: &str, versioned: bool) -> Result<()> {
    let gitignore = Path::new(root).join(".gitignore");
    let entry = if versioned {
        ".reado/index.sqlite"
    } else {
        ".reado/"
    };
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == entry) {
        return Ok(());
    }
    let mut content = existing;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(entry);
    content.push('\n');
    std::fs::write(gitignore, content)?;
    Ok(())
}

// ---- Anchoring -----------------------------------------------------------

const FUZZY_THRESHOLD: f32 = 0.6;
const CONTEXT_LINES: usize = 3;

/// Capture an adaptive context snapshot for the 1-based inclusive range.
pub fn extract_context(content: &str, start: u32, end: u32) -> Context {
    let lines: Vec<&str> = content.lines().collect();
    let n = lines.len();
    let s = (start.max(1) as usize) - 1;
    let e = ((end.max(start) as usize) - 1).min(n.saturating_sub(1));
    if s >= n {
        return Context::default();
    }
    let join = |a: usize, b: usize| lines[a..=b.min(n - 1)].join("\n");
    Context {
        snippet: join(s, e),
        before: if s > 0 {
            join(s.saturating_sub(CONTEXT_LINES), s - 1)
        } else {
            String::new()
        },
        after: if e + 1 < n {
            join(e + 1, (e + CONTEXT_LINES).min(n - 1))
        } else {
            String::new()
        },
    }
}

/// Average bigram similarity of a window against a target block (both already
/// trimmed line-by-line), or `None` when the lengths preclude a comparison.
fn window_score(window: &[String], target: &[String]) -> f32 {
    if target.is_empty() {
        return 0.0;
    }
    window
        .iter()
        .zip(target)
        .map(|(a, b)| similarity(a, b))
        .sum::<f32>()
        / target.len() as f32
}

/// Best fuzzy position of `target` within `lines`, with its score.
fn best_fuzzy(lines: &[String], target: &[String]) -> Option<(usize, f32)> {
    let len = target.len();
    if len == 0 || lines.len() < len {
        return None;
    }
    (0..=lines.len() - len)
        .map(|i| (i, window_score(&lines[i..i + len], target)))
        .max_by(|a, b| a.1.total_cmp(&b.1))
}

/// Recompute a comment's 1-based line range against new file content, using the
/// full anchored context (before + snippet + after). Returns `None` when the
/// anchor can no longer be located (orphan).
///
/// Strategy, most-precise first:
///   1. Exact match of the snippet block (closest to the old position).
///   2. **Context window** — slide `before + snippet + after` and take the
///      snippet sub-range of the best match. This survives edits to the snippet
///      itself, as long as the surrounding lines are stable, which is the common
///      case the plain snippet match would orphan.
///   3. Fuzzy match of the snippet alone.
pub fn relocate(old_start: u32, context: &Context, new_content: &str) -> Option<(u32, u32)> {
    let trim = |s: &str| -> Vec<String> { s.lines().map(|l| l.trim().to_string()).collect() };
    let snip = trim(&context.snippet);
    if snip.is_empty() {
        return None;
    }
    let lines = trim(new_content);
    let len = snip.len();
    if lines.is_empty() {
        return None;
    }

    // 1. Exact snippet block, nearest to the old line.
    let exact: Vec<usize> = (0..=lines.len().saturating_sub(len))
        .filter(|&i| lines.get(i..i + len).is_some_and(|w| w == snip.as_slice()))
        .collect();
    if let Some(&i) = exact
        .iter()
        .min_by_key(|&&i| ((i as i64 + 1) - old_start as i64).abs())
    {
        return Some(((i + 1) as u32, (i + len) as u32));
    }

    // 2. Context window: anchor by the surrounding lines so an edited snippet
    //    still follows. Only worthwhile when there is real context to lean on.
    let before = trim(&context.before);
    let after = trim(&context.after);
    if !before.is_empty() || !after.is_empty() {
        let blen = before.len();
        let window: Vec<String> = before.iter().chain(&snip).chain(&after).cloned().collect();
        if let Some((i, score)) = best_fuzzy(&lines, &window) {
            // Weight context fully but require the surrounding lines to be a
            // strong match, so we don't drag an anchor onto unrelated code.
            let ctx_only: Vec<String> = before.iter().chain(&after).cloned().collect();
            let ctx_window: Vec<String> = lines[i..i + window.len()]
                .iter()
                .enumerate()
                .filter(|(k, _)| *k < blen || *k >= blen + len)
                .map(|(_, l)| l.clone())
                .collect();
            let ctx_score = window_score(&ctx_window, &ctx_only);
            if score >= FUZZY_THRESHOLD && ctx_score >= FUZZY_THRESHOLD {
                let s = i + blen;
                return Some(((s + 1) as u32, (s + len) as u32));
            }
        }
    }

    // 3. Fuzzy snippet alone.
    match best_fuzzy(&lines, &snip) {
        Some((i, score)) if score >= FUZZY_THRESHOLD => Some(((i + 1) as u32, (i + len) as u32)),
        _ => None,
    }
}

/// Sørensen–Dice similarity of two strings over character bigrams (0.0–1.0).
fn similarity(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }
    let bigrams = |s: &str| -> Vec<[char; 2]> {
        let chars: Vec<char> = s.chars().collect();
        chars.windows(2).map(|w| [w[0], w[1]]).collect()
    };
    let mut ba = bigrams(a);
    let bb = bigrams(b);
    if ba.is_empty() || bb.is_empty() {
        return 0.0;
    }
    let (total_a, total_b) = (ba.len(), bb.len());
    let mut shared = 0usize;
    for bigram in bb {
        if let Some(pos) = ba.iter().position(|&x| x == bigram) {
            ba.swap_remove(pos);
            shared += 1;
        }
    }
    2.0 * shared as f32 / (total_a + total_b) as f32
}

/// Recompute anchors for every comment in `file` against the current content,
/// persisting changes, and return that file's updated comments. A missing file
/// or an unlocatable anchor flags the comment as an orphan.
pub fn reanchor_file(root: &str, file: &str) -> Result<Vec<Comment>> {
    let content = std::fs::read_to_string(Path::new(root).join(file)).ok();
    let dir = comments_dir(root);
    let mut updated = Vec::new();

    for mut comment in list_dir(&dir, false) {
        if comment.meta.anchor.file != file {
            continue;
        }
        if comment.meta.anchor.scope != Scope::Range {
            updated.push(comment);
            continue;
        }

        let was_orphan = comment.meta.orphan;
        let (start, end) = (comment.meta.anchor.start_line, comment.meta.anchor.end_line);
        let mut changed = false;

        match content
            .as_deref()
            .and_then(|c| relocate(start, &comment.meta.context, c).map(|r| (c, r)))
        {
            Some((c, (new_start, new_end))) => {
                if comment.meta.orphan {
                    comment.meta.orphan = false;
                    changed = true;
                }
                if (new_start, new_end) != (start, end) {
                    comment.meta.anchor.start_line = new_start;
                    comment.meta.anchor.end_line = new_end;
                    comment.meta.context = extract_context(c, new_start, new_end);
                    changed = true;
                }
            }
            None => {
                if !comment.meta.orphan {
                    comment.meta.orphan = true;
                    changed = true;
                }
            }
        }

        if changed && !(was_orphan && comment.meta.orphan) {
            write_comment(&dir, &comment.meta, &comment.messages)?;
        }
        updated.push(comment);
    }

    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_meta() -> CommentMeta {
        CommentMeta {
            id: "c_test".into(),
            comment_type: CommentType::Bug,
            state: CommentState::Open,
            kind: CommentKind::Task,
            anchor: Anchor {
                file: "src/main.rs".into(),
                scope: Scope::Range,
                start_line: 10,
                end_line: 12,
            },
            context: Context::default(),
            links: vec![],
            author: "user".into(),
            agent: None,
            origin: None,
            external_id: None,
            external_ref: None,
            orphan: false,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn round_trips_a_thread() {
        let meta = sample_meta();
        let messages = vec![
            Message {
                author: "user".into(),
                agent: None,
                created_at: 1000,
                body: "Please simplify this loop.".into(),
            },
            Message {
                author: "agent".into(),
                agent: Some("claude-code".into()),
                created_at: 2000,
                body: "Done.".into(),
            },
        ];
        let md = to_markdown(&meta, &messages).unwrap();
        let (m, msgs) = from_markdown(&md).unwrap();
        assert_eq!(m.id, "c_test");
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1].agent.as_deref(), Some("claude-code"));
    }

    fn ctx(snippet: &str) -> Context {
        Context {
            snippet: snippet.into(),
            before: String::new(),
            after: String::new(),
        }
    }

    #[test]
    fn relocate_follows_lines_inserted_above() {
        let snippet = "fn compute(x: i32) -> i32 {\n    x * 2\n}";
        let new = "// new\n// lines\n// here\nfn compute(x: i32) -> i32 {\n    x * 2\n}\n";
        assert_eq!(relocate(1, &ctx(snippet), new), Some((4, 6)));
    }

    #[test]
    fn relocate_fuzzy_tolerates_a_small_edit() {
        let snippet = "let total = items.iter().sum();\nreturn total;";
        let new = "let total = items.iter().copied().sum();\nreturn total;\n";
        assert_eq!(relocate(1, &ctx(snippet), new), Some((1, 2)));
    }

    #[test]
    fn relocate_orphans_when_gone() {
        let snippet = "this exact code\nno longer exists anywhere";
        let new = "completely\ndifferent\ncontent\n";
        assert_eq!(relocate(1, &ctx(snippet), new), None);
    }

    #[test]
    fn relocate_follows_an_edited_snippet_via_context() {
        // The commented line itself is rewritten *and* a line is inserted above.
        // Snippet-only fuzzy would orphan; the stable before/after carry it.
        let context = Context {
            before: "fn outer() {\n  let a = 1;".into(),
            snippet: "  let b = compute(a);".into(),
            after: "  return b;\n}".into(),
        };
        let new = "// header\nfn outer() {\n  let a = 1;\n  let b = compute(a, opts) ?? fallback;\n  return b;\n}\n";
        assert_eq!(relocate(3, &context, new), Some((4, 4)));
    }

    #[test]
    fn relocate_context_does_not_drag_onto_unrelated_code() {
        // Snippet gone and the surrounding context also absent → orphan, not a
        // false match somewhere else.
        let context = Context {
            before: "specific anchor line one\nspecific anchor line two".into(),
            snippet: "the body that vanished".into(),
            after: "specific tail line one\nspecific tail line two".into(),
        };
        let new = "totally\nunrelated\nfile\ncontents\nhere\n";
        assert_eq!(relocate(2, &context, new), None);
    }

    // ---- Disk lifecycle (temp project) ----------------------------------

    fn note(file: &str, body: &str) -> NewComment {
        NewComment {
            file: file.into(),
            scope: Scope::Range,
            start_line: 1,
            end_line: 1,
            comment_type: CommentType::Note,
            kind: CommentKind::Task,
            body: body.into(),
            context: Context::default(),
        }
    }

    #[test]
    fn create_list_resolve_archives() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        let created = create_comment(root, note("src/a.rs", "fix this"), "user", None).unwrap();
        assert!(created.first_comment);
        let id = created.comment.meta.id.clone();

        assert_eq!(list_comments(root).len(), 1);
        assert_eq!(list_archived(root).len(), 0);

        // Resolve → moves to archive.
        let done = set_comment_state(root, &id, CommentState::Done).unwrap();
        assert!(done.archived);
        assert_eq!(list_comments(root).len(), 0);
        assert_eq!(list_archived(root).len(), 1);

        // The id is still fetchable from the archive.
        assert_eq!(
            get_comment(root, &id).unwrap().meta.state,
            CommentState::Done
        );
    }

    #[test]
    fn reply_and_search() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let id = create_comment(root, note("src/b.rs", "needle here"), "user", None)
            .unwrap()
            .comment
            .meta
            .id;

        add_reply(
            root,
            &id,
            "agent",
            Some("claude-code".into()),
            "on it".into(),
        )
        .unwrap();
        let c = get_comment(root, &id).unwrap();
        assert_eq!(c.messages.len(), 2);
        assert_eq!(c.messages[1].agent.as_deref(), Some("claude-code"));

        assert_eq!(search_comments(root, "needle").len(), 1);
        assert_eq!(search_comments(root, "absent").len(), 0);
    }

    #[test]
    fn upsert_host_comment_is_idempotent_and_syncs_resolution() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();

        // First pull: an open GitHub thread → one active comment with a badge.
        let c = upsert_host_comment(
            root,
            "github",
            "TH_1",
            "42",
            "src/a.rs",
            10,
            "octocat",
            "nit here".into(),
            false,
        )
        .unwrap();
        assert_eq!(c.meta.origin.as_deref(), Some("github"));
        assert_eq!(c.meta.external_id.as_deref(), Some("TH_1"));
        assert_eq!(list_comments(root).len(), 1);

        // Re-pull the same thread, now resolved → still ONE comment, archived.
        let c2 = upsert_host_comment(
            root,
            "github",
            "TH_1",
            "42",
            "src/a.rs",
            12,
            "octocat",
            "nit here".into(),
            true,
        )
        .unwrap();
        assert_eq!(c2.meta.id, c.meta.id); // same comment, not a duplicate
        assert!(c2.archived);
        assert_eq!(c2.meta.state, CommentState::Done);
        assert_eq!(list_comments(root).len(), 0);
        assert_eq!(list_archived(root).len(), 1);

        // Reopen on the host → restored to active.
        let c3 = upsert_host_comment(
            root,
            "github",
            "TH_1",
            "42",
            "src/a.rs",
            12,
            "octocat",
            "nit here".into(),
            false,
        )
        .unwrap();
        assert!(!c3.archived);
        assert_eq!(list_comments(root).len(), 1);
    }

    #[test]
    fn rename_moves_comment_path() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        create_comment(root, note("old.rs", "x"), "user", None).unwrap();

        assert_eq!(rename_comments(root, "old.rs", "new.rs").unwrap(), 1);
        assert_eq!(list_comments(root)[0].meta.anchor.file, "new.rs");
    }
}
