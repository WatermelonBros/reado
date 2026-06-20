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
                    for path in event.paths {
                        pending.insert(path);
                    }
                }
                Ok(Err(_)) => {} // a watch error; ignore and keep going
                Err(RecvTimeoutError::Timeout) => {
                    let mut comments_dirty = false;
                    for path in pending.drain() {
                        // Changes under .reado/comments|archive mean an agent (via
                        // the `reado` CLI) mutated comments — tell the UI to reload.
                        if is_comment_store(&path) {
                            comments_dirty = true;
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
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}
