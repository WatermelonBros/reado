//! Filesystem watcher.
//!
//! Watches the project tree (recursively, no polling) and tells the frontend
//! which files changed, so comment anchors can be recomputed. Events are
//! debounced and filtered through the project's ignore rules, so churn in
//! `.git/`, `.reado/` or gitignored build output never reaches the UI.
//!
//! The frontend listens for `file-changed` and calls `reanchor_file` for the
//! reported path.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use ignore::WalkBuilder;
use notify::event::{ModifyKind, RenameMode};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

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
    // Cargo's build directory, on the same grounds — but only where a
    // `Cargo.toml` says the directory really is Cargo's, since `target` is an
    // ordinary name for a source folder anywhere else. A Rust project without a
    // `.gitignore` used to feed rust-analyzer its own build output through
    // `didChangeWatchedFiles`: the server re-ran its check, the check rewrote
    // `target/`, and the watcher reported that — a loop that cleared and
    // republished the file's diagnostics about once a second, which is what it
    // looked like from the Problems panel.
    if root.join("Cargo.toml").is_file() {
        let _ = builder.add_line(None, "target/");
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
        if dir.join("Cargo.toml").is_file() {
            let _ = nested.add_line(None, "target/");
        }
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

/// `path` as `/`-separated text, so the checks below read the same on Windows.
fn slashed(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// True if `path` is inside `.reado/<dir>/`.
fn in_reado_dir(path: &Path, dir: &str) -> bool {
    slashed(path).contains(&format!("/{}/{dir}/", reado_core::READO_DIR))
}

/// True if `path` is the file `.reado/<name>`.
fn is_reado_file(path: &Path, name: &str) -> bool {
    slashed(path).ends_with(&format!("/{}/{name}", reado_core::READO_DIR))
}

/// True if `path` is a comment file under `.reado/comments` or `.reado/archive`.
fn is_comment_store(path: &Path) -> bool {
    in_reado_dir(path, reado_core::COMMENTS_DIR) || in_reado_dir(path, reado_core::ARCHIVE_DIR)
}

/// True if `path` is a guided-review session under `.reado/sessions`. Changes
/// here mean the agent (via the `reado` CLI) advanced a session.
fn is_session_store(path: &Path) -> bool {
    in_reado_dir(path, reado_core::SESSIONS_DIR)
}

/// True if `path` is the agent's live reasoning feed. A change means the agent
/// (via `reado thought`) narrated another decision — reload the reasoning panel.
fn is_reasoning_store(path: &Path) -> bool {
    is_reado_file(path, reado_core::REASONING_FILE)
}

/// True if `path` is something the agent asked the companion to say
/// (`mascot_say` over MCP). Same channel as the handoff below, one file per
/// saying, most recent wins.
fn is_mascot_say(path: &Path) -> bool {
    is_reado_file(path, reado_core::MASCOT_FILE)
}

/// True if `path` is the agent's end-of-turn handoff (`session_done` over MCP).
/// A change means the agent said it is done, blocked or stuck — the moment to
/// get the attention of a user who walked away.
fn is_agent_done(path: &Path) -> bool {
    is_reado_file(path, reado_core::DONE_FILE)
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

/// The live watchers, keyed by the root each one watches.
///
/// The handles live here rather than inside their threads so they can be
/// dropped: each thread's loop exits on `Disconnected`, which is what dropping
/// the watcher (and with it the event sender) produces. Without somewhere to
/// hold them, a watcher could never be stopped.
#[derive(Default)]
pub struct WatcherState(Mutex<HashMap<PathBuf, notify::RecommendedWatcher>>);

/// A predicate on a changed path.
type PathTest = fn(&Path) -> bool;

/// The `.reado/` and `.git/` paths that stand for a panel reload rather than a
/// file change, each with the event it raises. A path matching one goes no
/// further. Each event is raised once per flush however many paths matched it,
/// because one commit (say) touches several of these files and the UI only
/// needs to re-read once.
const SIGNALS: &[(PathTest, &str)] = &[
    // Changes under .reado/comments|archive mean an agent (via the `reado` CLI)
    // mutated comments — tell the UI to reload.
    (is_comment_store, "comments-changed"),
    // Changes under .reado/sessions mean a guided review advanced (the agent
    // planned a route or proposed an artifact); tell the UI to reload the session.
    (is_session_store, "sessions-changed"),
    // The agent narrated a reasoning line via `reado thought`.
    (is_reasoning_store, "reasoning-changed"),
    // The agent handed the turn back via `session_done`.
    (is_agent_done, "agent-done"),
    (is_mascot_say, "mascot-say"),
    // Git state moved under us — a commit, checkout, stage or merge in the
    // terminal. `.git/` is otherwise ignored.
    (is_git_state, "git-changed"),
];

/// The event a moved file's comments raise.
const COMMENTS_CHANGED: &str = "comments-changed";

/// One coalescing window of filesystem events, between two flushes.
#[derive(Default)]
struct Batch {
    pending: HashSet<PathBuf>,
    // Tracked per debounce window so a delete+create pair (how macOS/FSEvents
    // reports a rename) can be reunited into a comment move instead of orphan.
    created: HashSet<PathBuf>,
    removed: HashSet<PathBuf>,
    /// When the current coalescing window opened. Used to cap it at
    /// MAX_COALESCE so continuous churn can't keep resetting the DEBOUNCE
    /// timer forever and starve the flush.
    window_start: Option<Instant>,
}

/// What a flush tells the UI.
#[derive(Debug, Default, PartialEq)]
struct Flushed {
    /// Project-relative files whose contents changed, for `file-changed`.
    files: Vec<String>,
    /// Events to raise, once each, in [`SIGNALS`] order.
    signals: Vec<&'static str>,
}

impl Batch {
    /// How long to wait for the next event. Normally a full quiet period, but
    /// never let the window exceed MAX_COALESCE: shrink the timeout to the
    /// remaining budget so a busy period still flushes instead of accumulating
    /// unbounded state.
    fn timeout(&self) -> Duration {
        match self.window_start {
            Some(start) => DEBOUNCE.min(MAX_COALESCE.saturating_sub(start.elapsed())),
            None => DEBOUNCE,
        }
    }

    /// Add one event to the window. Returns the endpoints of a rename that
    /// reported both of them (Linux/inotify), which lets the caller move a
    /// file's comments instead of orphaning them.
    fn record(&mut self, event: notify::Event) -> Option<(PathBuf, PathBuf)> {
        // Open the coalescing window on the first event since the last flush, so
        // MAX_COALESCE is measured from here.
        self.window_start.get_or_insert_with(Instant::now);
        if matches!(
            event.kind,
            EventKind::Modify(ModifyKind::Name(RenameMode::Both))
        ) && event.paths.len() == 2
        {
            let pair = (event.paths[0].clone(), event.paths[1].clone());
            // Still a change to both paths: an atomic write (temp file renamed
            // into place) is exactly this event, and skipping it would miss
            // `.reado/` updates and file saves alike.
            self.pending.extend(event.paths);
            return Some(pair);
        }
        // Categorise each path as a create / remove / neither so the flush can
        // pair a delete+create into a rename. `Side::Unknown` is a single-ended
        // rename (FSEvents) decided by existence.
        enum Side {
            Create,
            Remove,
            Unknown,
            Other,
        }
        let side = match event.kind {
            EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                Side::Create
            }
            EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                Side::Remove
            }
            EventKind::Modify(ModifyKind::Name(_)) => Side::Unknown,
            _ => Side::Other,
        };
        for path in event.paths {
            match side {
                Side::Create => {
                    self.created.insert(path.clone());
                }
                Side::Remove => {
                    self.removed.insert(path.clone());
                }
                Side::Unknown => {
                    if path.exists() {
                        self.created.insert(path.clone());
                    } else {
                        self.removed.insert(path.clone());
                    }
                }
                Side::Other => {}
            }
            self.pending.insert(path);
        }
        None
    }

    /// Close the window: move comments across a delete+create rename, then sort
    /// every pending path into a signal, a changed file, or nothing.
    fn flush(&mut self, root: &Path, matchers: &[Gitignore]) -> Flushed {
        let mut raised: HashSet<&'static str> = HashSet::new();
        if let Some((from, to)) = pair_rename(root, &self.removed, &self.created) {
            if reado_core::rename_comments(&root.to_string_lossy(), &from, &to).unwrap_or(0) > 0 {
                raised.insert(COMMENTS_CHANGED);
            }
        }
        self.created.clear();
        self.removed.clear();
        // Window flushed; the next event opens a fresh one.
        self.window_start = None;

        let mut files = Vec::new();
        for path in self.pending.drain() {
            if let Some((_, event)) = SIGNALS.iter().find(|(matches, _)| matches(&path)) {
                raised.insert(event);
                continue;
            }
            if path.is_dir() || is_ignored(matchers, &path) {
                continue;
            }
            if let Some(rel) = relative(root, &path) {
                files.push(rel);
            }
        }
        Flushed {
            files,
            signals: SIGNALS
                .iter()
                .map(|(_, event)| *event)
                .filter(|event| raised.contains(event))
                .collect(),
        }
    }
}

/// Reunite a delete+create into a rename: if exactly one removed file carried
/// comments and exactly one file was created in this window, treat it as that
/// file's new path. Returns `(from, to)`, project-relative, when the comments
/// should move.
fn pair_rename(
    root: &Path,
    removed: &HashSet<PathBuf>,
    created: &HashSet<PathBuf>,
) -> Option<(String, String)> {
    if removed.is_empty() || created.is_empty() {
        return None;
    }
    let comments = reado_core::list_comments(&root.to_string_lossy());
    let removed_commented: Vec<&PathBuf> = removed
        .iter()
        .filter(|p| {
            relative(root, p).is_some_and(|rel| comments.iter().any(|c| c.meta.anchor.file == rel))
        })
        .collect();
    if removed_commented.len() != 1 || created.len() != 1 {
        return None;
    }
    let created_path = created.iter().next()?;
    let from = relative(root, removed_commented[0])?;
    let to = relative(root, created_path)?;
    // Corroborate the pairing: the created file must still contain one of the
    // removed file's anchored snippets. Counts of 1+1 alone are coincidental — an
    // unrelated delete+create in the same window would otherwise move comments
    // onto the wrong file.
    let new_content = std::fs::read_to_string(created_path).unwrap_or_default();
    let looks_like_rename = comments.iter().any(|c| {
        c.meta.anchor.file == from && {
            let s = c.meta.context.snippet.trim();
            !s.is_empty() && new_content.contains(s)
        }
    });
    (from != to && looks_like_rename).then_some((from, to))
}

/// Start watching `root`, and stop watching anything else.
///
/// The window shows one project at a time and remounts its view on a switch, so
/// this is called again for each project opened. It is idempotent per root, and
/// retires the previous project's watcher: left running, that thread would go on
/// emitting `file-changed` with paths relative to the *old* root, which the new
/// project's listener would take for its own — on top of leaking a thread and a
/// recursive filesystem registration per project opened.
#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    watchers: State<'_, WatcherState>,
    root: String,
) -> Result<(), String> {
    let root = PathBuf::from(&root);

    {
        // Dropping the stale watchers ends their threads. Done before the new
        // one is registered so a re-entry for the same root is a no-op.
        let mut live = watchers.0.lock().map_err(|e| e.to_string())?;
        live.retain(|watched, _| watched == &root);
        if live.contains_key(&root) {
            return Ok(());
        }
    }

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
    watchers
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(root.clone(), watcher);

    std::thread::spawn(move || {
        // Built here, not in the command: collecting the ignore files walks the
        // project, and `start_watching` is a blocking command — on the UI thread.
        let matchers = ignore_matchers(&root);
        let mut batch = Batch::default();
        loop {
            match rx.recv_timeout(batch.timeout()) {
                Ok(Ok(event)) => {
                    let Some((from, to)) = batch.record(event) else {
                        continue;
                    };
                    if let (Some(from), Some(to)) = (relative(&root, &from), relative(&root, &to)) {
                        if reado_core::rename_comments(&root.to_string_lossy(), &from, &to)
                            .unwrap_or(0)
                            > 0
                        {
                            let _ = app.emit(COMMENTS_CHANGED, ());
                        }
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
                    let flushed = batch.flush(&root, &matchers);
                    for file in flushed.files {
                        crate::log::debug(
                            "watcher",
                            "file changed (reanchor)",
                            serde_json::json!({ "file": file }),
                        );
                        let _ = app.emit("file-changed", FileChanged { file });
                    }
                    for event in flushed.signals {
                        let _ = app.emit(event, ());
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
    use notify::event::{CreateKind, DataChange, RemoveKind};

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
    fn cargos_build_output_is_ignored_even_with_no_gitignore() {
        // rust-analyzer writes `target/` while it checks. Reporting those writes
        // back to it made it check again — a loop that cleared and republished
        // the file's diagnostics about once a second. A Rust project usually has
        // `/target` in its `.gitignore`; one that does not must not melt.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("target/debug/incremental")).unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        std::fs::write(root.join("target/debug/incremental/dep-graph.bin"), "").unwrap();
        std::fs::write(root.join("src/main.rs"), "").unwrap();

        let m = ignore_matchers(root);
        assert!(is_ignored(
            &m,
            &root.join("target/debug/incremental/dep-graph.bin")
        ));
        assert!(!is_ignored(&m, &root.join("src/main.rs")));
    }

    #[test]
    fn a_target_directory_that_is_not_cargos_is_left_alone() {
        // `target` is an ordinary name for a source folder; only a `Cargo.toml`
        // beside it says the directory is a build output.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("target")).unwrap();
        std::fs::write(root.join("target/index.ts"), "").unwrap();

        assert!(!is_ignored(
            &ignore_matchers(root),
            &root.join("target/index.ts")
        ));
    }

    #[test]
    fn the_agents_handoff_is_its_own_event() {
        // It must not be mistaken for a comment or session write: those reload a
        // panel, this one gets the user's attention.
        assert!(is_mascot_say(Path::new("/p/.reado/mascot.json")));
        assert!(!is_mascot_say(Path::new("/p/.reado/done.json")));
        assert!(!is_mascot_say(Path::new("/p/src/mascot.json")));
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

    fn event(kind: EventKind, paths: &[&Path]) -> notify::Event {
        paths
            .iter()
            .fold(notify::Event::new(kind), |e, p| e.add_path(p.to_path_buf()))
    }

    #[test]
    fn a_rename_reporting_both_ends_is_also_a_change_to_both() {
        // An atomic write — a temp file renamed into place — arrives as exactly
        // this event. Handing back the pair for the comment move must not stop
        // it counting as a change, or `.reado/` updates and saves go missing.
        let mut batch = Batch::default();
        let tmp = PathBuf::from("/p/.reado/comments/.c1.md.tmp");
        let file = PathBuf::from("/p/.reado/comments/c1.md");
        let pair = batch.record(event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[&tmp, &file],
        ));
        assert_eq!(pair, Some((tmp.clone(), file.clone())));
        assert!(batch.pending.contains(&tmp) && batch.pending.contains(&file));
        assert!(batch.window_start.is_some(), "the window must open");
        assert!(batch.created.is_empty() && batch.removed.is_empty());
        assert_eq!(
            batch.flush(Path::new("/p"), &[]).signals,
            vec!["comments-changed"]
        );
    }

    #[test]
    fn creates_and_removes_are_sorted_for_rename_pairing() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let (new, old) = (root.join("new.ts"), root.join("old.ts"));
        let (here, gone) = (root.join("here.ts"), root.join("gone.ts"));
        let edited = root.join("edited.ts");
        std::fs::write(&here, "").unwrap();

        let mut batch = Batch::default();
        assert_eq!(
            batch.record(event(EventKind::Create(CreateKind::File), &[&new])),
            None
        );
        batch.record(event(EventKind::Remove(RemoveKind::File), &[&old]));
        // A single-ended rename (FSEvents) is decided by whether the path exists.
        batch.record(event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            &[&here, &gone],
        ));
        batch.record(event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            &[&edited],
        ));
        assert_eq!(batch.created, HashSet::from([new.clone(), here.clone()]));
        assert_eq!(batch.removed, HashSet::from([old.clone(), gone.clone()]));
        assert_eq!(batch.pending.len(), 5);
    }

    #[test]
    fn the_window_never_outlives_max_coalesce() {
        let mut batch = Batch::default();
        assert_eq!(batch.timeout(), DEBOUNCE);
        // Sustained churn: the window opened MAX_COALESCE ago, so it flushes now
        // rather than waiting out another quiet period.
        batch.window_start = Instant::now().checked_sub(MAX_COALESCE);
        if batch.window_start.is_some() {
            assert_eq!(batch.timeout(), Duration::ZERO);
        }
    }

    #[test]
    fn a_flush_raises_each_signal_once_and_reports_real_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.ts"), "").unwrap();

        let mut batch = Batch::default();
        batch.record(event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            &[
                &root.join(".git/index"),
                &root.join(".git/refs/heads/main"),
                &root.join(".reado/sessions/s1.json"),
                &root.join(".git/objects/ab/cdef"),
                &root.join("src"),
                &root.join("src/a.ts"),
            ],
        ));
        let flushed = batch.flush(root, &ignore_matchers(root));
        // Two git files, one event; a directory and git's objects are nothing.
        assert_eq!(flushed.files, vec!["src/a.ts".to_string()]);
        assert_eq!(flushed.signals, vec!["sessions-changed", "git-changed"]);
        assert!(batch.pending.is_empty() && batch.window_start.is_none());
    }

    #[test]
    fn a_delete_and_create_pair_is_a_rename_only_when_the_content_followed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let root_str = root.to_string_lossy();
        std::fs::write(root.join("a.ts"), "fn keep_me() {}\n").unwrap();
        reado_core::create_comment(
            &root_str,
            reado_core::NewComment {
                file: "a.ts".into(),
                scope: reado_core::Scope::Range,
                start_line: 1,
                end_line: 1,
                comment_type: reado_core::CommentType::Note,
                kind: reado_core::CommentKind::Task,
                body: "check this".into(),
                context: Default::default(),
                url: None,
                x: None,
                y: None,
                target: None,
            },
            "human",
            None,
        )
        .unwrap();
        std::fs::remove_file(root.join("a.ts")).unwrap();
        let removed = HashSet::from([root.join("a.ts")]);

        std::fs::write(root.join("b.ts"), "fn keep_me() {}\n").unwrap();
        let created = HashSet::from([root.join("b.ts")]);
        assert_eq!(
            pair_rename(root, &removed, &created),
            Some(("a.ts".to_string(), "b.ts".to_string()))
        );

        // 1+1 by count, but the new file holds none of the anchored code.
        std::fs::write(root.join("c.ts"), "something else\n").unwrap();
        let unrelated = HashSet::from([root.join("c.ts")]);
        assert_eq!(pair_rename(root, &removed, &unrelated), None);

        // Two candidates is a guess, not a rename.
        let two = HashSet::from([root.join("b.ts"), root.join("c.ts")]);
        assert_eq!(pair_rename(root, &removed, &two), None);
        assert_eq!(pair_rename(root, &HashSet::new(), &created), None);
    }

    #[test]
    fn a_windows_path_is_recognised_too() {
        assert!(is_git_state(Path::new(r"C:\p\.git\refs\heads\main")));
    }
}
