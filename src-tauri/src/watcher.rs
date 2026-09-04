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
use std::time::{Duration, Instant};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use ignore::WalkBuilder;
use notify::event::{ModifyKind, RenameMode};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Debounce window: changes are coalesced over this quiet period before firing.
const DEBOUNCE: Duration = Duration::from_millis(250);

/// Maximum time a coalescing window may stay open. Under sustained sub-DEBOUNCE
/// churn (a build, bulk checkout, or formatter touching many files) the quiet
/// period never elapses, so without this cap `created`/`removed`/`pending` would
/// grow unbounded and the delete+create rename heuristic (which needs exactly
/// one removed + one created) could never fire — orphaning a renamed file's
/// comments. Forcing a flush after this long keeps the window bounded.
const MAX_COALESCE: Duration = Duration::from_millis(1000);

/// Payload for the `file-changed` event: a project-relative, forward-slashed path.
#[derive(Clone, Serialize)]
struct FileChanged {
    file: String,
}

/// Build the ignore matchers for a project: the root `.gitignore` (plus the
/// always-ignored VCS/Reado/dependency directories) and **every nested one**.
///
/// Nested matters: the file tree walks with the `ignore` crate, which honours a
/// `.gitignore` at any depth, so a monorepo that keeps its rules in
/// `app/.gitignore` shows no `app/node_modules` in the tree. The watcher used to
/// read the root file only and therefore disagreed — a dev server rewriting
/// `app/node_modules/.vite/deps` became a thousand `file-changed` events, each
/// one a re-anchor, a re-index and a `git status` on the UI thread. That is what
/// a locked-up window looks like from the inside.
///
/// Each matcher's patterns are relative to the directory its file sits in, so
/// they are kept apart rather than merged into one root-scoped matcher (`/dist`
/// in `app/.gitignore` means `app/dist`, not `<root>/dist`).
///
/// ponytail: read once, at watch time. A `.gitignore` added or edited later is
/// picked up on the next project open — reload it here if that ever bites.
fn ignore_matchers(root: &Path) -> Vec<Gitignore> {
    let mut builder = GitignoreBuilder::new(root);
    let _ = builder.add(root.join(".gitignore"));
    // Always ignored, whatever the project's own rules say. `node_modules` earns
    // its place next to the VCS directories: it is the loudest churn on disk
    // (installs, dev-server dep caches) and nothing in it is worth re-anchoring.
    for pat in [".git/", ".reado/", "node_modules/"] {
        let _ = builder.add_line(None, pat);
    }
    let mut matchers = vec![builder.build().unwrap_or_else(|_| Gitignore::empty())];

    // The walk honours what it has found so far, so it never descends into an
    // ignored tree looking for more ignore files.
    for entry in WalkBuilder::new(root).hidden(false).build().flatten() {
        if entry.depth() == 0 || entry.file_name() != ".gitignore" {
            continue;
        }
        let Some(dir) = entry.path().parent() else {
            continue;
        };
        if dir == root {
            continue; // already in the root matcher
        }
        let mut nested = GitignoreBuilder::new(dir);
        let _ = nested.add(entry.path());
        if let Ok(g) = nested.build() {
            matchers.push(g);
        }
    }
    matchers
}

/// True if `path` should be ignored (VCS/Reado internals or ignored output).
/// The `starts_with` guard is required, not defensive: `matched_path_or_any_parents`
/// panics on a path outside its matcher's root.
fn is_ignored(matchers: &[Gitignore], path: &Path) -> bool {
    let is_dir = path.is_dir();
    matchers.iter().any(|m| {
        path.starts_with(m.path()) && m.matched_path_or_any_parents(path, is_dir).is_ignore()
    })
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

/// True if `path` is the agent's live reasoning feed. A change means the agent
/// (via `reado thought`) narrated another decision — reload the reasoning panel.
fn is_reasoning_store(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.ends_with("/.reado/reasoning.jsonl")
}

/// True if `path` is the agent's end-of-turn handoff (`session_done` over MCP).
/// A change means the agent said it is done, blocked or stuck — the moment to
/// get the attention of a user who walked away.
fn is_agent_done(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    s.ends_with("/.reado/done.json")
}

/// True if `path` is git state whose change alters what `git status` would say.
///
/// `.git/HEAD` alone is not enough: it is rewritten by `git checkout`, but a
/// commit on the current branch leaves it pointing at the same ref. What moves
/// is the branch ref, the index, or `packed-refs` — so a commit made in the
/// terminal left the UI showing the pre-commit working tree until something else
/// happened to refresh it.
fn is_git_state(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('\\', "/");
    let Some((_, rest)) = s.split_once("/.git/") else {
        return false;
    };
    // `refs/…` covers branches and tags; `logs/…` covers the reflog, which moves
    // on every commit even when a ref is packed.
    rest == "HEAD"
        || rest == "index"
        || rest == "packed-refs"
        || rest == "MERGE_HEAD"
        || rest.starts_with("refs/")
        || rest.starts_with("logs/")
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

    let (tx, rx) = channel();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    crate::log::info(
        "watcher",
        "watching",
        serde_json::json!({ "root": root.to_string_lossy() }),
    );

    std::thread::spawn(move || {
        // Keep the watcher alive for the lifetime of this loop.
        let _watcher = watcher;
        // Built here, not in the command: collecting the ignore files walks the
        // project, and `start_watching` is a blocking command — on the UI thread.
        let matchers = ignore_matchers(&root);
        let mut pending: HashSet<PathBuf> = HashSet::new();
        // Tracked per debounce window so a delete+create pair (how macOS/FSEvents
        // reports a rename) can be reunited into a comment move instead of orphan.
        let mut created: HashSet<PathBuf> = HashSet::new();
        let mut removed: HashSet<PathBuf> = HashSet::new();
        // When the current coalescing window opened. Used to cap it at
        // MAX_COALESCE so continuous churn can't keep resetting the DEBOUNCE
        // timer forever and starve the flush.
        let mut window_start: Option<Instant> = None;

        loop {
            // Normally wait a full quiet period, but never let the window exceed
            // MAX_COALESCE: shrink the timeout to the remaining budget so a busy
            // period still flushes instead of accumulating unbounded state.
            let timeout = match window_start {
                Some(start) => DEBOUNCE.min(MAX_COALESCE.saturating_sub(start.elapsed())),
                None => DEBOUNCE,
            };
            match rx.recv_timeout(timeout) {
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
                    // Open the coalescing window on the first event since the
                    // last flush, so MAX_COALESCE is measured from here.
                    window_start.get_or_insert_with(Instant::now);
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
                Ok(Err(e)) => {
                    // a watch error; log it but keep going
                    crate::log::warn(
                        "watcher",
                        "watch error",
                        serde_json::json!({ "error": e.to_string() }),
                    );
                }
                Err(RecvTimeoutError::Timeout) => {
                    let mut comments_dirty = false;
                    let mut sessions_dirty = false;
                    let mut reasoning_dirty = false;
                    let mut agent_done_dirty = false;
                    let mut git_dirty = false;

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
                            let created_path = created.iter().next().unwrap();
                            if let (Some(from), Some(to)) = (
                                relative(&root, removed_commented[0]),
                                relative(&root, created_path),
                            ) {
                                // Corroborate the pairing: the created file must
                                // still contain one of the removed file's anchored
                                // snippets. Counts of 1+1 alone are coincidental —
                                // an unrelated delete+create in the same window
                                // would otherwise move comments onto the wrong file.
                                let new_content =
                                    std::fs::read_to_string(created_path).unwrap_or_default();
                                let looks_like_rename = comments.iter().any(|c| {
                                    c.meta.anchor.file == from && {
                                        let s = c.meta.context.snippet.trim();
                                        !s.is_empty() && new_content.contains(s)
                                    }
                                });
                                if from != to
                                    && looks_like_rename
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
                    // Window flushed; the next event opens a fresh one.
                    window_start = None;

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
                        // The agent narrated a reasoning line via `reado thought`.
                        if is_reasoning_store(&path) {
                            reasoning_dirty = true;
                            continue;
                        }
                        // The agent handed the turn back via `session_done`.
                        if is_agent_done(&path) {
                            agent_done_dirty = true;
                            continue;
                        }
                        // Git state moved under us — a commit, checkout, stage or
                        // merge in the terminal. Flagged rather than emitted here,
                        // because one commit touches several of these files and the
                        // UI only needs to re-read once. `.git/` is otherwise
                        // ignored below.
                        if is_git_state(&path) {
                            git_dirty = true;
                            continue;
                        }
                        if path.is_dir() || is_ignored(&matchers, &path) {
                            continue;
                        }
                        if let Some(rel) = relative(&root, &path) {
                            crate::log::debug(
                                "watcher",
                                "file changed (reanchor)",
                                serde_json::json!({ "file": rel }),
                            );
                            let _ = app.emit("file-changed", FileChanged { file: rel });
                        }
                    }
                    if comments_dirty {
                        let _ = app.emit("comments-changed", ());
                    }
                    if sessions_dirty {
                        let _ = app.emit("sessions-changed", ());
                    }
                    if reasoning_dirty {
                        let _ = app.emit("reasoning-changed", ());
                    }
                    if agent_done_dirty {
                        let _ = app.emit("agent-done", ());
                    }
                    if git_dirty {
                        let _ = app.emit("git-changed", ());
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_nested_gitignore_is_honoured_and_stays_in_its_own_directory() {
        // The lock-up this guards: a monorepo keeps its rules in `app/.gitignore`,
        // the watcher read the root file only, and a dev server rewriting
        // `app/node_modules/.vite/deps` became a thousand `file-changed` events —
        // each a re-anchor, a re-index and a `git status` on the UI thread.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("app/build")).unwrap();
        std::fs::create_dir_all(root.join("app/node_modules/.vite/deps")).unwrap();
        std::fs::create_dir_all(root.join("app/src")).unwrap();
        std::fs::create_dir_all(root.join("build")).unwrap();
        std::fs::write(root.join("app/.gitignore"), "build/\n").unwrap();
        for f in [
            "app/build/out.js",
            "app/node_modules/.vite/deps/dep.js",
            "app/src/main.ts",
            "build/keep.ts",
        ] {
            std::fs::write(root.join(f), "").unwrap();
        }

        let m = ignore_matchers(root);
        assert!(is_ignored(&m, &root.join("app/build/out.js")));
        // node_modules goes regardless of whether any .gitignore names it.
        assert!(is_ignored(
            &m,
            &root.join("app/node_modules/.vite/deps/dep.js")
        ));
        assert!(!is_ignored(&m, &root.join("app/src/main.ts")));
        // `build/` came from app's file: it must not reach a root-level build dir.
        assert!(!is_ignored(&m, &root.join("build/keep.ts")));
    }

    #[test]
    fn the_agents_handoff_is_its_own_event() {
        // It must not be mistaken for a comment or session write: those reload a
        // panel, this one gets the user's attention.
        assert!(is_agent_done(Path::new("/p/.reado/done.json")));
        assert!(!is_agent_done(Path::new("/p/.reado/sessions/s1.json")));
        assert!(!is_comment_store(Path::new("/p/.reado/done.json")));
        assert!(!is_session_store(Path::new("/p/.reado/done.json")));
        // A file merely named done.json elsewhere in the project isn't it.
        assert!(!is_agent_done(Path::new("/p/src/done.json")));
    }

    #[test]
    fn archiving_a_comment_is_a_comment_change() {
        // Resolving a comment writes under `archive/`, not `comments/` — miss
        // it and the panel keeps showing the stale set.
        assert!(is_comment_store(Path::new("/p/.reado/comments/c1.md")));
        assert!(is_comment_store(Path::new("/p/.reado/archive/c1.md")));
        assert!(!is_comment_store(Path::new("/p/src/a.ts")));
    }

    #[test]
    fn a_commit_counts_as_git_state_not_just_a_checkout() {
        // The bug this guards: `.git/HEAD` alone missed a commit on the current
        // branch (HEAD still names the same ref), so the Source Control badge
        // kept its pre-commit count until something else refreshed it.
        assert!(is_git_state(Path::new("/p/.git/refs/heads/main")));
        assert!(is_git_state(Path::new("/p/.git/logs/HEAD")));
        assert!(is_git_state(Path::new("/p/.git/index")));
        assert!(is_git_state(Path::new("/p/.git/packed-refs")));
        assert!(is_git_state(Path::new("/p/.git/HEAD")));
        assert!(is_git_state(Path::new("/p/.git/MERGE_HEAD")));
    }

    #[test]
    fn git_internals_that_change_nothing_visible_are_ignored() {
        // Object writes and lock files churn constantly; refreshing on them
        // would be a `git status` per byte written during a fetch.
        assert!(!is_git_state(Path::new("/p/.git/objects/ab/cdef")));
        assert!(!is_git_state(Path::new("/p/.git/COMMIT_EDITMSG")));
        assert!(!is_git_state(Path::new("/p/.git/config")));
        assert!(!is_git_state(Path::new("/p/src/HEAD")));
        assert!(!is_git_state(Path::new("/p/src/main.rs")));
    }

    #[test]
    fn a_windows_path_is_recognised_too() {
        assert!(is_git_state(Path::new(r"C:\p\.git\refs\heads\main")));
    }
}
