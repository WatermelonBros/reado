//! Filesystem watcher.
//!
//! Watches the project tree (recursively, no polling) and tells the frontend
//! which files changed, so comment anchors can be recomputed. Events are
//! debounced and filtered through the project's ignore rules, so churn in
//! `.git/`, `.reado/` or gitignored build output never reaches the UI.
//!
//! The frontend listens for `file-changed` and calls `reanchor_file` for the
//! reported path.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::time::Duration;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::event::{ModifyKind, RenameMode};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Debounce window: changes are coalesced over this quiet period before firing.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Payload for the `file-changed` event: a project-relative, forward-slashed path.
#[derive(Clone, Serialize)]
struct FileChanged {
    file: String,
}

/// Build the ignore matcher for a project root (its `.gitignore` plus the
/// always-ignored Reado/VCS directories).
fn ignore_matcher(root: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(root);
    let _ = builder.add(root.join(".gitignore"));
    // Always ignore these regardless of the project's own rules.
    for pat in [".git/", ".reado/"] {
        let _ = builder.add_line(None, pat);
    }
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

/// True if `path` should be ignored (VCS/Reado internals or gitignored output).
fn is_ignored(matcher: &Gitignore, root: &Path, path: &Path) -> bool {
    let rel = path.strip_prefix(root).unwrap_or(path);
    matcher
        .matched_path_or_any_parents(rel, path.is_dir())
        .is_ignore()
}

/// True if `path` is a comment file under `.reado/comments` or `.reado/archive`.
fn is_comment_store(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.contains("/.reado/comments/") || s.contains("/.reado/archive/")
}

/// True if `path` is a guided-review session under `.reado/sessions`. Changes
/// here mean the agent (via the `reado` CLI) advanced a session.
fn is_session_store(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.contains("/.reado/sessions/")
}

/// True if `path` is the repo's `.git/HEAD` (rewritten when the branch changes).
fn is_git_head(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.ends_with("/.git/HEAD")
}

/// Convert an absolute path to a project-relative, forward-slashed string.
fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    Some(rel.to_string_lossy().replace('\\', "/"))
}

/// Start watching `root`. Spawns a background watcher that emits `file-changed`
/// for each non-ignored file that changes. Safe to leave running for the
/// window's lifetime; the watcher is owned by the spawned thread.
#[tauri::command]
pub fn start_watching(app: AppHandle, root: String) -> Result<(), String> {
    let root = PathBuf::from(&root);
    let matcher = ignore_matcher(&root);

    let (tx, rx) = channel();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        // Keep the watcher alive for the lifetime of this loop.
        let _watcher = watcher;
        let mut pending: HashSet<PathBuf> = HashSet::new();
        // Tracked per debounce window so a delete+create pair (how macOS/FSEvents
        // reports a rename) can be reunited into a comment move instead of orphan.
        let mut created: HashSet<PathBuf> = HashSet::new();
        let mut removed: HashSet<PathBuf> = HashSet::new();

        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(Ok(event)) => {
                    // A rename that reports both endpoints (Linux/inotify) lets us
                    // move a file's comments instead of orphaning them.
                    if matches!(
                        event.kind,
                        EventKind::Modify(ModifyKind::Name(RenameMode::Both))
                    ) && event.paths.len() == 2
                    {
                        if let (Some(from), Some(to)) = (
                            relative(&root, &event.paths[0]),
                            relative(&root, &event.paths[1]),
                        ) {
                            if reado_core::rename_comments(&root.to_string_lossy(), &from, &to)
                                .unwrap_or(0)
                                > 0
                            {
                                let _ = app.emit("comments-changed", ());
                            }
                        }
                        continue;
                    }
                    // Categorise each path as a create / remove / neither so the
                    // flush can pair a delete+create into a rename. `Side::Unknown`
                    // is a single-ended rename (FSEvents) decided by existence.
                    enum Side {
                        Create,
                        Remove,
                        Unknown,
                        Other,
                    }
                    let side = match event.kind {
                        EventKind::Create(_)
                        | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => Side::Create,
                        EventKind::Remove(_)
                        | EventKind::Modify(ModifyKind::Name(RenameMode::From)) => Side::Remove,
                        EventKind::Modify(ModifyKind::Name(_)) => Side::Unknown,
                        _ => Side::Other,
                    };
                    for path in event.paths {
                        match side {
                            Side::Create => {
                                created.insert(path.clone());
                            }
                            Side::Remove => {
                                removed.insert(path.clone());
                            }
                            Side::Unknown => {
                                if path.exists() {
                                    created.insert(path.clone());
                                } else {
                                    removed.insert(path.clone());
                                }
                            }
                            Side::Other => {}
                        }
                        pending.insert(path);
                    }
                }
                Ok(Err(_)) => {} // a watch error; ignore and keep going
                Err(RecvTimeoutError::Timeout) => {
                    let mut comments_dirty = false;
                    let mut sessions_dirty = false;

                    // Reunite a delete+create into a rename: if exactly one removed
                    // file carried comments and exactly one file was created in this
                    // window, treat it as that file's new path and move the comments.
                    if !removed.is_empty() && !created.is_empty() {
                        let root_str = root.to_string_lossy();
                        let comments = reado_core::list_comments(&root_str);
                        let removed_commented: Vec<&PathBuf> = removed
                            .iter()
                            .filter(|p| {
                                relative(&root, p).is_some_and(|rel| {
                                    comments.iter().any(|c| c.meta.anchor.file == rel)
                                })
                            })
                            .collect();
                        if removed_commented.len() == 1 && created.len() == 1 {
                            if let (Some(from), Some(to)) = (
                                relative(&root, removed_commented[0]),
                                relative(&root, created.iter().next().unwrap()),
                            ) {
                                if from != to
                                    && reado_core::rename_comments(&root_str, &from, &to)
                                        .unwrap_or(0)
                                        > 0
                                {
                                    comments_dirty = true;
                                }
                            }
                        }
                    }
                    created.clear();
                    removed.clear();

                    for path in pending.drain() {
                        // Changes under .reado/comments|archive mean an agent (via
                        // the `reado` CLI) mutated comments — tell the UI to reload.
                        if is_comment_store(&path) {
                            comments_dirty = true;
                            continue;
                        }
                        // Changes under .reado/sessions mean a guided review
                        // advanced (the agent planned a route or proposed an
                        // artifact); tell the UI to reload the session.
                        if is_session_store(&path) {
                            sessions_dirty = true;
                            continue;
                        }
                        // `.git/HEAD` is rewritten on `git checkout`, so a change
                        // there means the branch switched (even from the terminal);
                        // tell the UI to refresh git state. `.git/` is otherwise
                        // ignored below.
                        if is_git_head(&path) {
                            let _ = app.emit("git-changed", ());
                            continue;
                        }
                        if path.is_dir() || is_ignored(&matcher, &root, &path) {
                            continue;
                        }
                        if let Some(rel) = relative(&root, &path) {
                            let _ = app.emit("file-changed", FileChanged { file: rel });
                        }
                    }
                    if comments_dirty {
                        let _ = app.emit("comments-changed", ());
                    }
                    if sessions_dirty {
                        let _ = app.emit("sessions-changed", ());
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}
