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
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

use crate::fs::base64_encode;

/// A live terminal session: the PTY master (for resize), its writer, and child.
struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
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
        // A login shell loads the user's profile so PATH/aliases match a terminal.
        (
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()),
            vec!["-l"],
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

/// Spawn a PTY for tab `id`, running a login shell in `cwd`. Output is streamed
/// via the `pty-output-{id}` event (base64); termination fires `pty-exit-{id}`.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
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
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The parent does not need the slave end once the child holds it.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Stream output until EOF, then signal exit.
    let output_event = format!("pty-output-{id}");
    let exit_event = format!("pty-exit-{id}");
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit(&exit_event, ());
                    break;
                }
                Ok(n) => {
                    let _ = app.emit(&output_event, base64_encode(&buf[..n]));
                }
            }
        }
    });

    state.0.lock().unwrap().insert(
        id,
        Session {
            master: pair.master,
            writer,
            child,
        },
    );
    Ok(())
}

/// Forward user input (keystrokes / injected text) to a session.
#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    if let Some(session) = state.0.lock().unwrap().get_mut(&id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        let _ = session.writer.flush();
    }
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

/// Kill a session and drop it from the registry.
#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    if let Some(mut session) = state.0.lock().unwrap().remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}
