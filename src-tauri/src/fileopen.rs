//! "Open with Reado" for text/source files.
//!
//! When the OS is asked to open a file with Reado (double-click, `open -a`,
//! default-app association), it reaches us three ways: a `RunEvent::Opened`
//! Apple event on macOS, process argv on a cold Windows/Linux launch, and the
//! single-instance plugin forwarding argv when the app is already running. All
//! of them funnel into [`open_path`].
//!
//! A file opens at a *project root* — the enclosing git repo if there is one,
//! otherwise the file's own directory — and the file itself is opened in the
//! editor. Requests that arrive before the UI is ready are queued and drained by
//! the frontend on mount; later ones are emitted to the live window.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Where a single file should open: its resolved project root and its own path.
#[derive(Clone, Serialize)]
pub struct OpenTarget {
    pub root: String,
    pub file: String,
}

/// Pending OS open requests, plus whether the UI has come up yet. Before it has,
/// targets are queued (the frontend drains them on mount); after, they're emitted.
#[derive(Default)]
pub struct OpenQueue {
    ready: AtomicBool,
    pending: Mutex<Vec<OpenTarget>>,
}

/// Walk up from `start` to the nearest ancestor holding a `.git` entry.
fn git_root(start: &Path) -> Option<PathBuf> {
    let mut cur = Some(start);
    while let Some(dir) = cur {
        if dir.join(".git").exists() {
            return Some(dir.to_path_buf());
        }
        cur = dir.parent();
    }
    None
}

/// Resolve an open target for `path`: the enclosing git root if any, else the
/// file's parent directory. `None` for anything that isn't an existing file.
fn resolve_target(path: &Path) -> Option<OpenTarget> {
    let file = path.canonicalize().ok()?;
    if !file.is_file() {
        return None;
    }
    let dir = file.parent()?;
    let root = git_root(dir).unwrap_or_else(|| dir.to_path_buf());
    Some(OpenTarget {
        root: root.to_string_lossy().into_owned(),
        file: file.to_string_lossy().into_owned(),
    })
}

/// Handle an OS request to open `path` with Reado. Queues it until the UI is
/// ready, then emits to the main window; always brings the app forward.
pub fn open_path(app: &AppHandle, path: &Path) {
    let Some(target) = resolve_target(path) else {
        return;
    };
    let state = app.state::<OpenQueue>();
    if state.ready.load(Ordering::SeqCst) {
        let _ = app.emit_to("main", "reado://open-path", target);
    } else if let Ok(mut pending) = state.pending.lock() {
        pending.push(target);
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_focus();
    }
}

/// Scan process argv for file paths to open (Windows/Linux cold launch; on macOS
/// files arrive via `RunEvent::Opened` instead, so this is a harmless no-op there).
pub fn open_from_args(app: &AppHandle) {
    for arg in std::env::args().skip(1) {
        let p = Path::new(&arg);
        if p.is_file() {
            open_path(app, p);
        }
    }
}

/// Drain (and clear) any file-opens queued before the UI was ready, and mark the
/// UI ready so subsequent opens are emitted live. Called once by the frontend on
/// the main window's mount.
#[tauri::command]
pub fn drain_open_targets(state: tauri::State<OpenQueue>) -> Vec<OpenTarget> {
    state.ready.store(true, Ordering::SeqCst);
    state
        .pending
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default()
}
