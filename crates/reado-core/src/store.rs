//! The comment store: paths, ids, the `.reado` lock, and every read and
//! mutation of the comment files.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::anchor::{extract_context, relocate};
use crate::format::{from_markdown, to_markdown};
use crate::*;

/// The project's Reado directory.
pub const READO_DIR: &str = ".reado";

// The files under `READO_DIR` that more than one side reads or writes — the
// desktop, the CLI and the MCP server. One name each, so the two ends of a file
// queue cannot drift apart.
pub const LOCK_FILE: &str = ".lock";
pub const COMMENTS_DIR: &str = "comments";
pub const ARCHIVE_DIR: &str = "archive";
pub const SESSIONS_DIR: &str = "sessions";
pub const CONFIG_FILE: &str = "config.json";
/// The agent's turn handoff ([`crate::mark_session_done`]).
pub const DONE_FILE: &str = "done.json";
/// What the agent asked the companion to say ([`crate::mark_mascot_say`]).
pub const MASCOT_FILE: &str = "mascot.json";
/// The agent's append-only thought log (`reado thought`).
pub const REASONING_FILE: &str = "reasoning.jsonl";
/// How far the user has read.
pub const READ_PROGRESS_FILE: &str = "read.json";
pub const BOOKMARKS_FILE: &str = "bookmarks.json";
/// The browser-preview control queue: a command in, its result out.
pub const PREVIEW_CMD_FILE: &str = "preview-cmd.json";
pub const PREVIEW_RESULT_FILE: &str = "preview-result.json";
/// The preview's mirrored console and network logs.
pub const PREVIEW_CONSOLE_FILE: &str = "preview-console.json";
pub const PREVIEW_NETWORK_FILE: &str = "preview-network.json";

/// `<root>/.reado`.
pub fn reado_dir(root: &str) -> PathBuf {
    Path::new(root).join(READO_DIR)
}

/// Advisory cross-process lock over `.reado`, held for the duration of a
/// read-modify-write so two `reado` processes (or the desktop + a CLI) can't
/// interleave and lose an update. The flock is released when the file is dropped
/// at the end of the calling function. Every mutation is a leaf (none calls
/// another), so acquiring per-function can't deadlock.
pub(crate) struct ReadoLock {
    _file: std::fs::File,
}

impl ReadoLock {
    pub(crate) fn acquire(root: &str) -> Result<Self> {
        use fs2::FileExt;
        let dir = reado_dir(root);
        std::fs::create_dir_all(&dir)?;
        let file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(dir.join(LOCK_FILE))?;
        file.lock_exclusive()?;
        Ok(ReadoLock { _file: file })
    }
}
fn comments_dir(root: &str) -> PathBuf {
    reado_dir(root).join(COMMENTS_DIR)
}
fn archive_dir(root: &str) -> PathBuf {
    reado_dir(root).join(ARCHIVE_DIR)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Milliseconds since the epoch — every timestamp Reado stores.
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Generate a unique id with the given prefix (e.g. `c` for comments, `s` for
/// sessions, `p` for proposals). The counter is shared so ids never collide
/// within a process even at the same millisecond; the pid is mixed in so two
/// separate processes (CLI + desktop, or two CLI invocations) that hit the same
/// millisecond can't both mint `c_<T>_0` and clobber each other's comment file.
pub(crate) fn gen_id(prefix: &str) -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "{prefix}_{:x}_{:x}_{:x}",
        now_millis(),
        std::process::id(),
        n
    )
}

pub(crate) fn new_id() -> String {
    gen_id("c")
}

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
    // Atomic write (mirrors session::save): a plain `std::fs::write` leaves the
    // file empty/partial during its O_TRUNC+write window, so a concurrent reader
    // (the watcher's rename detection, or a UI reload on comments-changed) would
    // read torn markdown, fail front-matter parsing, and silently drop the
    // comment. Write a hidden sibling temp file, then rename it into place
    // (atomic on the same volume). The `.` prefix and `.tmp` extension keep it
    // out of `list_dir` (which only reads `*.md`).
    let tmp = dir.join(format!(".{}.md.tmp", meta.id));
    std::fs::write(&tmp, to_markdown(meta, messages)?)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Write `path` whole or not at all: a hidden sibling temp file renamed into
/// place. For the `.reado/` files the other side polls or watches — a plain
/// `std::fs::write` lets it read the file mid-write, torn.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
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
    create_comment_by(root, input, author, agent, None)
}

/// `create_comment`, naming the person who wrote it (see [`Person`]).
pub fn create_comment_by(
    root: &str,
    input: NewComment,
    author: &str,
    agent: Option<String>,
    by: Option<Person>,
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

    let meta = CommentMeta::new(
        input.comment_type,
        input.kind,
        Anchor {
            url: input.url,
            x: input.x,
            y: input.y,
            target: input.target,
            ..Anchor::code(input.file, input.scope, input.start_line, input.end_line)
        },
        author,
        agent.clone(),
        now,
    );
    let meta = CommentMeta {
        context,
        by: by.clone(),
        ..meta
    };
    let messages = vec![Message {
        author: author.to_string(),
        agent,
        by,
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

/// Read-modify-write one comment under the `.reado` lock: `f` edits it in place,
/// then it is stamped and written back where it already lives.
fn mutate_comment(root: &str, id: &str, f: impl FnOnce(&mut Comment)) -> Result<Comment> {
    mutate_and_place(root, id, |c| {
        f(c);
        c.archived
    })
}

/// [`mutate_comment`] for a change that can also move the comment: `f` returns
/// whether it now belongs in `archive/` (`true`) or `comments/` (`false`).
fn mutate_and_place(root: &str, id: &str, f: impl FnOnce(&mut Comment) -> bool) -> Result<Comment> {
    let _lock = ReadoLock::acquire(root)?;
    let mut comment = load(root, id)?;
    let archive = f(&mut comment);
    comment.meta.updated_at = now_millis();
    store(root, &mut comment, archive)?;
    Ok(comment)
}

/// Read comment `id` from wherever it lives (active, then archive).
fn load(root: &str, id: &str) -> Result<Comment> {
    let (path, archived) = locate(root, id).ok_or_else(|| Error::NotFound(id.to_string()))?;
    read_comment(&path, archived)
}

/// Write `comment` into `archive/` (`archive`) or `comments/`, moving it when
/// that is not where it was read from.
fn store(root: &str, comment: &mut Comment, archive: bool) -> Result<()> {
    // Write the new location first, then remove the old one. Removing first and
    // then failing the write (target dir unwritable, crash/kill between the
    // calls) would lose the comment from both stores; write-then-delete at worst
    // leaves a recoverable duplicate.
    write_comment(&dir_for(root, archive), &comment.meta, &comment.messages)?;
    if comment.archived != archive {
        let old = dir_for(root, comment.archived).join(format!("{}.md", comment.meta.id));
        std::fs::remove_file(old)?;
        comment.archived = archive;
    }
    Ok(())
}

/// Update a comment's metadata and/or root message body.
pub fn update_comment(root: &str, id: &str, patch: CommentPatch) -> Result<Comment> {
    mutate_comment(root, id, |comment| {
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
    })
}

/// Append a reply to a comment's thread.
pub fn add_reply(
    root: &str,
    id: &str,
    author: &str,
    agent: Option<String>,
    body: String,
) -> Result<Comment> {
    add_reply_by(root, id, author, agent, None, body)
}

/// `add_reply`, naming the person who wrote it (see [`Person`]).
pub fn add_reply_by(
    root: &str,
    id: &str,
    author: &str,
    agent: Option<String>,
    by: Option<Person>,
    body: String,
) -> Result<Comment> {
    mutate_comment(root, id, |comment| {
        comment.messages.push(Message {
            author: author.to_string(),
            agent,
            by,
            created_at: now_millis(),
            body,
        });
    })
}

/// Add a manual link from comment `id` to `target` (bidirectional is the
/// caller's choice; here we record one direction). Idempotent.
pub fn link_comments(root: &str, id: &str, target: &str) -> Result<Comment> {
    let _lock = ReadoLock::acquire(root)?;
    let mut comment = load(root, id)?;
    // Only an actual change is written: linking twice leaves the file alone.
    if !comment.meta.links.iter().any(|l| l == target) {
        comment.meta.links.push(target.to_string());
        comment.meta.updated_at = now_millis();
        let archived = comment.archived;
        store(root, &mut comment, archived)?;
    }
    Ok(comment)
}

/// Manually re-anchor a comment to a new file/range (used to resolve orphans).
/// Recomputes the context snapshot from the file and clears the orphan flag.
pub fn set_anchor(root: &str, id: &str, file: &str, start: u32, end: u32) -> Result<Comment> {
    mutate_comment(root, id, |comment| {
        comment.meta.anchor.file = file.to_string();
        comment.meta.anchor.scope = Scope::Range;
        comment.meta.anchor.start_line = start;
        comment.meta.anchor.end_line = end.max(start);
        comment.meta.orphan = false;
        if let Ok(content) = std::fs::read_to_string(Path::new(root).join(file)) {
            comment.meta.context = extract_context(&content, start, end.max(start));
        }
    })
}

/// Set a comment's state. Transitioning to `done` archives the file
/// (`comments/` → `archive/`); leaving `done` restores it.
pub fn set_comment_state(root: &str, id: &str, state: CommentState) -> Result<Comment> {
    mutate_and_place(root, id, |comment| {
        comment.meta.state = state;
        state == CommentState::Done
    })
}

/// Resolve a task with its provenance attached.
///
/// A resolution with a passing verification is `Done`; anything else —
/// no verification run, or one that failed — is `ResolvedUnverified`, because
/// the agent's claim and a proof are not the same fact and the reviewer needs to
/// know which one they have.
pub fn resolve_comment(root: &str, id: &str, resolution: Resolution) -> Result<Comment> {
    let verified = resolution.verify.as_ref().is_some_and(|v| v.passed);
    let state = if verified {
        CommentState::Done
    } else {
        CommentState::ResolvedUnverified
    };

    mutate_and_place(root, id, |comment| {
        comment.meta.state = state;
        comment.meta.resolution = Some(resolution);
        comment.meta.blocked_reason = None;
        // Only a verified resolution archives: an unverified one stays in the
        // active list, because it is still waiting on a human to look at it.
        verified
    })
}

/// Block a task: record why the agent cannot proceed and take it out of the
/// resolvable set until a human answers. Idempotent — blocking an already
/// blocked task just replaces the reason.
pub fn block_comment(root: &str, id: &str, reason: &str) -> Result<Comment> {
    mutate_comment(root, id, |comment| {
        comment.meta.state = CommentState::Blocked;
        comment.meta.blocked_reason = Some(reason.trim().to_string());
    })
}

/// Answer a blocked task: add the human's context as a reply and return it to
/// open, with the attempt counter reset — the agent is being given something it
/// did not have before, so the previous failures no longer count against it.
pub fn answer_blocked(root: &str, id: &str, author: &str, note: &str) -> Result<Comment> {
    answer_blocked_by(root, id, author, None, note)
}

/// `answer_blocked`, naming the person who answered (see [`Person`]).
pub fn answer_blocked_by(
    root: &str,
    id: &str,
    author: &str,
    by: Option<Person>,
    note: &str,
) -> Result<Comment> {
    // Reply and reopen in one write under one lock: done as two, an agent could
    // read the answer while the task still says blocked, or a write in between
    // could be lost.
    mutate_comment(root, id, |comment| {
        comment.messages.push(Message {
            author: author.to_string(),
            agent: None,
            by,
            created_at: now_millis(),
            body: note.to_string(),
        });
        comment.meta.state = CommentState::Open;
        comment.meta.blocked_reason = None;
        comment.meta.attempts = 0;
    })
}

/// Record a failed attempt. Returns the task, blocked automatically once the
/// attempt budget is spent: at that point "try again" has been tried enough for
/// the loop to know it isn't working.
pub fn fail_attempt(root: &str, id: &str) -> Result<Comment> {
    mutate_comment(root, id, |comment| {
        comment.meta.attempts = comment.meta.attempts.saturating_add(1);
        if comment.meta.attempts >= ATTEMPT_BUDGET {
            comment.meta.state = CommentState::Blocked;
            comment.meta.blocked_reason = Some(format!(
                "{} attempts failed without resolving it",
                comment.meta.attempts
            ));
        } else {
            comment.meta.state = CommentState::Open;
        }
    })
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
    let _lock = ReadoLock::acquire(root)?;
    let existing = list_comments(root)
        .into_iter()
        .chain(list_archived(root))
        .find(|c| {
            c.meta.origin.as_deref() == Some(origin)
                && c.meta.external_id.as_deref() == Some(external_id)
        });
    let now = now_millis();
    let want_done = resolved;
    let scope = if line > 0 { Scope::Range } else { Scope::File };

    let mut comment = match existing {
        Some(mut c) => {
            c.meta.anchor.file = file.to_string();
            c.meta.anchor.scope = scope;
            c.meta.anchor.start_line = line;
            c.meta.anchor.end_line = line;
            if let Some(root_msg) = c.messages.first_mut() {
                root_msg.body = body;
            }
            c
        }
        None => {
            let meta = CommentMeta {
                origin: Some(origin.to_string()),
                external_id: Some(external_id.to_string()),
                external_ref: Some(external_ref.to_string()),
                ..CommentMeta::new(
                    CommentType::Note,
                    CommentKind::Note,
                    Anchor::code(file, scope, line, line),
                    author,
                    None,
                    now,
                )
            };
            // Not on disk yet: "archived" names the store it is about to go to,
            // so there is no old copy for `store` to remove.
            Comment {
                messages: vec![Message {
                    author: author.to_string(),
                    agent: None,
                    by: None,
                    created_at: now,
                    body,
                }],
                meta,
                archived: want_done,
            }
        }
    };

    comment.meta.state = if want_done {
        CommentState::Done
    } else {
        CommentState::Open
    };
    comment.meta.updated_at = now;

    // Place the file in the right store, moving it if resolution changed.
    store(root, &mut comment, want_done)?;
    Ok(comment)
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

    /// A real task on disk under `root`, for the state-machine tests.
    fn task(root: &str, body: &str) -> Comment {
        create_comment(
            root,
            NewComment {
                file: "src/main.rs".into(),
                scope: Scope::Range,
                start_line: 1,
                end_line: 1,
                comment_type: CommentType::Bug,
                kind: CommentKind::Task,
                body: body.into(),
                context: Context::default(),
                url: None,
                x: None,
                y: None,
                target: None,
            },
            "user",
            None,
        )
        .unwrap()
        .comment
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
            url: None,
            x: None,
            y: None,
            target: None,
        }
    }

    // Regression: concurrent read-modify-write on the same comment must not lose
    // updates. Without the `.reado` advisory lock, N threads each read M messages,
    // append one, and write M+1 — the last writer wins and replies are lost.
    #[test]
    fn concurrent_add_reply_does_not_lose_updates() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        let id = create_comment(&root, note("a.rs", "hi"), "user", None)
            .unwrap()
            .comment
            .meta
            .id;
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let root = root.clone();
                let id = id.clone();
                std::thread::spawn(move || {
                    add_reply(&root, &id, "user", None, format!("reply {i}")).unwrap();
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        // Root message + all 8 replies survive (none dropped by the race).
        assert_eq!(get_comment(&root, &id).unwrap().messages.len(), 9);
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

    #[test]
    fn blocking_records_the_reason_and_survives_the_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        let blocked =
            super::block_comment(&root, &c.meta.id, "  which of the two anchors?  ").unwrap();
        assert_eq!(blocked.meta.state, CommentState::Blocked);
        assert_eq!(
            blocked.meta.blocked_reason.as_deref(),
            Some("which of the two anchors?"),
            "the reason is trimmed and kept beside the state"
        );

        // Re-read from disk: the state and reason are in the `.md`, not just in memory.
        let reread = super::get_comment(&root, &c.meta.id).unwrap();
        assert_eq!(reread.meta.state, CommentState::Blocked);
        assert_eq!(
            reread.meta.blocked_reason.as_deref(),
            Some("which of the two anchors?")
        );
    }

    #[test]
    fn blocking_twice_replaces_the_reason() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");
        super::block_comment(&root, &c.meta.id, "first").unwrap();
        let again = super::block_comment(&root, &c.meta.id, "second").unwrap();
        assert_eq!(again.meta.blocked_reason.as_deref(), Some("second"));
    }

    #[test]
    fn a_failed_attempt_counts_and_returns_the_task_to_open() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        let after = super::fail_attempt(&root, &c.meta.id).unwrap();
        assert_eq!(after.meta.attempts, 1);
        assert_eq!(
            after.meta.state,
            CommentState::Open,
            "still worth another try"
        );
    }

    #[test]
    fn spending_the_attempt_budget_blocks_the_task_by_itself() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        for _ in 0..super::ATTEMPT_BUDGET - 1 {
            let mid = super::fail_attempt(&root, &c.meta.id).unwrap();
            assert_eq!(mid.meta.state, CommentState::Open);
        }
        let last = super::fail_attempt(&root, &c.meta.id).unwrap();
        assert_eq!(last.meta.state, CommentState::Blocked);
        assert!(
            last.meta.blocked_reason.unwrap().contains("attempts"),
            "the auto-block says why it gave up"
        );
    }

    #[test]
    fn answering_reopens_the_task_and_forgives_the_attempts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");
        for _ in 0..super::ATTEMPT_BUDGET {
            super::fail_attempt(&root, &c.meta.id).unwrap();
        }

        let answered = super::answer_blocked(&root, &c.meta.id, "human", "the second one").unwrap();
        assert_eq!(answered.meta.state, CommentState::Open);
        assert_eq!(answered.meta.blocked_reason, None);
        assert_eq!(
            answered.meta.attempts, 0,
            "the agent is being given something new; the old failures don't count"
        );
        assert!(
            answered
                .messages
                .iter()
                .any(|m| m.body.contains("the second one")),
            "the answer is in the thread, not just discarded"
        );
    }

    #[test]
    fn a_comment_written_before_blocking_existed_still_loads() {
        // `blocked_reason`/`attempts` are additive: an older `.md` has neither.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");
        let path = dir
            .path()
            .join(".reado/comments")
            .join(format!("{}.md", c.meta.id));
        let text = std::fs::read_to_string(&path).unwrap();
        let stripped: String = text
            .lines()
            .filter(|l| !l.starts_with("blockedReason") && !l.starts_with("attempts"))
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(&path, stripped).unwrap();

        let reread = super::get_comment(&root, &c.meta.id).unwrap();
        assert_eq!(reread.meta.attempts, 0);
        assert_eq!(reread.meta.blocked_reason, None);
    }

    #[test]
    fn a_verified_resolution_is_done_and_archived() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        let resolved = super::resolve_comment(
            &root,
            &c.meta.id,
            Resolution {
                agent: "claude-code".into(),
                model: Some("opus".into()),
                diff_ref: Some("abc123".into()),
                verify: Some(Verification {
                    cmd: "cargo test".into(),
                    passed: true,
                }),
                at: 42,
            },
        )
        .unwrap();
        assert_eq!(resolved.meta.state, CommentState::Done);
        assert!(resolved.archived, "a proved fix belongs in history");

        let reread = super::get_comment(&root, &c.meta.id).unwrap();
        let record = reread.meta.resolution.unwrap();
        assert_eq!(record.agent, "claude-code");
        assert_eq!(record.model.as_deref(), Some("opus"));
        assert_eq!(record.diff_ref.as_deref(), Some("abc123"));
        assert!(record.verify.unwrap().passed);
    }

    #[test]
    fn an_unchecked_resolution_is_a_claim_and_stays_in_the_active_list() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        let resolved = super::resolve_comment(
            &root,
            &c.meta.id,
            Resolution {
                agent: "claude-code".into(),
                model: None,
                diff_ref: None,
                verify: None,
                at: 42,
            },
        )
        .unwrap();
        assert_eq!(resolved.meta.state, CommentState::ResolvedUnverified);
        assert!(!resolved.archived, "still waiting on a human to look");
    }

    #[test]
    fn a_failing_check_is_not_done_either() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");

        let resolved = super::resolve_comment(
            &root,
            &c.meta.id,
            Resolution {
                agent: "claude-code".into(),
                model: None,
                diff_ref: None,
                verify: Some(Verification {
                    cmd: "cargo test".into(),
                    passed: false,
                }),
                at: 42,
            },
        )
        .unwrap();
        assert_eq!(resolved.meta.state, CommentState::ResolvedUnverified);
    }

    #[test]
    fn resolving_clears_a_previous_block() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let c = task(&root, "fix the drift");
        super::block_comment(&root, &c.meta.id, "which anchor?").unwrap();

        let resolved = super::resolve_comment(
            &root,
            &c.meta.id,
            Resolution {
                agent: "claude-code".into(),
                model: None,
                diff_ref: None,
                verify: Some(Verification {
                    cmd: "true".into(),
                    passed: true,
                }),
                at: 42,
            },
        )
        .unwrap();
        assert_eq!(resolved.meta.blocked_reason, None);
    }
}
