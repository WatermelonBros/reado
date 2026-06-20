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

// ---- Errors --------------------------------------------------------------

/// Errors from store operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("YAML error: {0}")]
    Yaml(String),
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

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("c_{:x}_{:x}", now_millis(), n)
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

/// Delete a comment entirely (never archived — deletion is permanent).
pub fn delete_comment(root: &str, id: &str) -> Result<()> {
    let (path, _) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    std::fs::remove_file(path)?;
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

/// Recompute a comment's 1-based line range against new file content. Returns
/// `None` when the anchor can no longer be located (orphan).
pub fn relocate(old_start: u32, snippet: &str, new_content: &str) -> Option<(u32, u32)> {
    let snip: Vec<String> = snippet.lines().map(|l| l.trim().to_string()).collect();
    if snip.is_empty() {
        return None;
    }
    let lines: Vec<String> = new_content.lines().map(|l| l.trim().to_string()).collect();
    let len = snip.len();

    let exact: Vec<usize> = (0..=lines.len().saturating_sub(len))
        .filter(|&i| lines.get(i..i + len).is_some_and(|w| w == snip.as_slice()))
        .collect();
    if let Some(&i) = exact
        .iter()
        .min_by_key(|&&i| ((i as i64 + 1) - old_start as i64).abs())
    {
        return Some(((i + 1) as u32, (i + len) as u32));
    }

    if lines.is_empty() {
        return None;
    }
    let mut best: Option<(usize, f32)> = None;
    for i in 0..=lines.len().saturating_sub(len) {
        let window = &lines[i..i + len];
        let score: f32 = window
            .iter()
            .zip(&snip)
            .map(|(a, b)| similarity(a, b))
            .sum::<f32>()
            / len as f32;
        if best.map(|(_, s)| score > s).unwrap_or(true) {
            best = Some((i, score));
        }
    }
    match best {
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
            .and_then(|c| relocate(start, &comment.meta.context.snippet, c).map(|r| (c, r)))
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

    #[test]
    fn relocate_follows_lines_inserted_above() {
        let snippet = "fn compute(x: i32) -> i32 {\n    x * 2\n}";
        let new = "// new\n// lines\n// here\nfn compute(x: i32) -> i32 {\n    x * 2\n}\n";
        assert_eq!(relocate(1, snippet, new), Some((4, 6)));
    }

    #[test]
    fn relocate_fuzzy_tolerates_a_small_edit() {
        let snippet = "let total = items.iter().sum();\nreturn total;";
        let new = "let total = items.iter().copied().sum();\nreturn total;\n";
        assert_eq!(relocate(1, snippet, new), Some((1, 2)));
    }

    #[test]
    fn relocate_orphans_when_gone() {
        let snippet = "this exact code\nno longer exists anywhere";
        let new = "completely\ndifferent\ncontent\n";
        assert_eq!(relocate(1, snippet, new), None);
    }
}
