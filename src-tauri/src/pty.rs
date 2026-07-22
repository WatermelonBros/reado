//! The integrated terminal: real pseudo-terminals (PTYs).
//!
//! Each terminal tab in the UI is backed by a PTY hosting a login shell. This is
//! where the user launches `claude`/`codex` and where Reado injects the "send
//! review" prompt. We stream PTY output to the frontend as per-session Tauri
//! events and forward keystrokes/resize back through commands.
//!
//! Output is base64-framed so escape sequences and any non-UTF-8 bytes survive
//! the JSON event boundary intact.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::fs::base64_encode;

/// A live terminal session: the PTY master (for resize), its writer, and child.
struct Session {
    master: Box<dyn MasterPty + Send>,
    /// Behind its own lock so a write can release the global registry lock first
    /// — a PTY whose input buffer is full must not block every other terminal.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
    /// The window that owns this session, so closing that window can reap its
    /// PTYs (a webview teardown won't reliably run the React unmount cleanup).
    window: String,
}

/// Tauri-managed registry of terminal sessions, keyed by the UI's tab id.
#[derive(Default)]
pub struct PtyState(Mutex<HashMap<String, Session>>);

/// The login shell to spawn, with its arguments, per platform.
fn default_shell() -> (String, Vec<&'static str>) {
    #[cfg(windows)]
    {
        (
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into()),
            vec![],
        )
    }
    #[cfg(not(windows))]
    {
        // A login *and interactive* shell: `-l` sources the profile, `-i` sources
        // the rc file (~/.zshrc, ~/.bashrc) where version managers (nvm/fnm/asdf)
        // put the right node/pnpm on PATH. Without `-i` the terminal can run a
        // different node than the user's real terminal — enough to send dev-server
        // watchers (e.g. Next.js) into an infinite recompile loop.
        (
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()),
            vec!["-il"],
        )
    }
}

fn size(rows: u16, cols: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// The executable path/name used for newly spawned PTY shells.
#[tauri::command]
pub fn pty_default_shell() -> String {
    default_shell().0
}

/// Spawn a PTY for tab `id`, running a login shell in `cwd`. Output is streamed
/// via the `pty-output-{id}` event (base64); termination fires `pty-exit-{id}`.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    window: tauri::Window,
    state: State<PtyState>,
    id: String,
    cwd: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(size(rows, cols))
        .map_err(|e| e.to_string())?;

    let (shell, args) = default_shell();
    let mut cmd = CommandBuilder::new(shell);
    for arg in args {
        cmd.arg(arg);
    }
    if !cwd.is_empty() {
        cmd.cwd(&cwd);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        crate::log::error(
            "pty",
            "spawn failed",
            serde_json::json!({ "id": id.as_str(), "error": e.to_string() }),
        );
        e.to_string()
    })?;
    let pid = child.process_id();
    crate::log::info(
        "pty",
        "spawned",
        serde_json::json!({ "id": id.as_str(), "cwd": cwd, "window": window.label(), "pid": pid }),
    );
    // The parent does not need the slave end once the child holds it.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Register the session before the reader thread runs, so a child that exits
    // immediately can't race its own cleanup (remove + reap, below) against this
    // insert and leave a stale session behind.
    state.0.lock().unwrap().insert(
        id.clone(),
        Session {
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            child,
            window: window.label().to_string(),
        },
    );

    // Stream output until EOF, then signal exit and drop/reap the session so its
    // PTY fds and (on Unix) the child's zombie don't linger when the shell exits
    // on its own.
    let output_event = format!("pty-output-{id}");
    let exit_event = format!("pty-exit-{id}");
    let exit_id = id;
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    crate::log::info("pty", "child exited", serde_json::json!({ "id": exit_id }));
                    let _ = app.emit(&exit_event, ());
                    // Bind out of the guard so the registry lock is released
                    // before the (blocking) wait().
                    let removed = app.state::<PtyState>().0.lock().unwrap().remove(&exit_id);
                    if let Some(mut session) = removed {
                        let _ = session.child.wait();
                    }
                    break;
                }
                Ok(n) => {
                    let _ = app.emit(&output_event, base64_encode(&buf[..n]));
                }
            }
        }
    });

    Ok(())
}

/// Forward user input (keystrokes / injected text) to a session.
#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    // Grab the writer handle under the registry lock, then drop that lock before
    // writing: the PTY master is blocking, so a full input buffer (a paused or
    // non-reading TUI) must not stall every other terminal — nor app exit, which
    // contends on this same lock.
    let writer = match state.0.lock().unwrap().get(&id) {
        Some(session) => Arc::clone(&session.writer),
        None => return Ok(()),
    };
    let mut writer = writer.lock().unwrap();
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    let _ = writer.flush();
    Ok(())
}

/// Resize a session's PTY to match the rendered terminal.
#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(session) = state.0.lock().unwrap().get(&id) {
        session
            .master
            .resize(size(rows, cols))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Best-effort terminate of a session's whole process tree.
///
/// The shell is the PTY's session leader; a foreground job (e.g. `pnpm dev`)
/// runs in its own process group. Killing only the shell would orphan that job,
/// so we signal the tty's foreground process group too — SIGHUP to let it clean
/// up, then SIGKILL — before killing the shell itself.
fn terminate(session: &mut Session) {
    #[cfg(unix)]
    if let Some(pgrp) = session.master.process_group_leader() {
        unsafe {
            libc::killpg(pgrp, libc::SIGHUP);
            libc::killpg(pgrp, libc::SIGKILL);
        }
    }
    // Windows has no process groups here: `child.kill()` only reaps the shell,
    // leaving grandchildren (e.g. the `claude`/node it launched) alive — which
    // hangs app close. Kill the whole tree by PID with taskkill.
    #[cfg(windows)]
    if let Some(pid) = session.child.process_id() {
        let _ = crate::proc::command("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    let _ = session.child.kill();
}

/// Kill a session and drop it from the registry.
#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    if let Some(mut session) = state.0.lock().unwrap().remove(&id) {
        crate::log::info("pty", "killed", serde_json::json!({ "id": id }));
        terminate(&mut session);
    }
    Ok(())
}

/// Terminate every live session — called when the app is exiting so no shell or
/// dev server outlives Reado.
pub fn kill_all(state: &PtyState) {
    if let Ok(mut map) = state.0.lock() {
        for (_, mut session) in map.drain() {
            terminate(&mut session);
        }
    }
}

/// Terminate every session owned by `window` — called when that window closes so
/// its shells/dev servers don't linger as orphans while the app keeps running.
pub fn kill_for_window(state: &PtyState, window: &str) {
    if let Ok(mut map) = state.0.lock() {
        let ids: Vec<String> = map
            .iter()
            .filter(|(_, s)| s.window == window)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            if let Some(mut session) = map.remove(&id) {
                terminate(&mut session);
            }
        }
    }
}
