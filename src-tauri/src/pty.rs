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

/// Tauri-managed registry of terminal sessions, keyed by the UI's tab id, plus
/// the input that arrived before a session existed.
///
/// A pane is in the frontend's layout the moment it is created; its shell is
/// spawned a frame or two later by the component that draws it. Anything that
/// opens a pane and runs a command in it — a task, a test run, a notebook —
/// writes into that gap, and a write with nowhere to go used to be discarded in
/// silence. It waits here instead, and [`pty_spawn`] delivers it.
#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
    pending: Mutex<HashMap<String, String>>,
}

/// Most input a pane may hold before its shell exists. A command line, not a
/// paste buffer: a pane that never spawns must not hold anything of size.
const MAX_PENDING_BYTES: usize = 8 * 1024;

impl PtyState {
    /// Hold input for a pane whose shell has not spawned yet.
    ///
    /// Capped: a pane that never spawns must not keep a paste buffer alive for
    /// the session. Past the cap the extra is dropped rather than the whole —
    /// the beginning of a command line is what identifies it in a log.
    fn hold(&self, id: String, data: &str) {
        let mut pending = self.pending.lock().unwrap();
        let waiting = pending.entry(id).or_default();
        if waiting.len() + data.len() <= MAX_PENDING_BYTES {
            waiting.push_str(data);
        }
    }

    /// Take whatever a pane was holding, if anything.
    fn take_held(&self, id: &str) -> Option<String> {
        self.pending
            .lock()
            .unwrap()
            .remove(id)
            .filter(|t| !t.is_empty())
    }
}

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

/// Spawn a PTY for tab `id`, running a shell in `cwd`. Output is streamed via
/// the `pty-output-{id}` event (base64); termination fires `pty-exit-{id}`.
///
/// `shell` and `shell_args` override the platform's login shell when the user
/// has configured one. An override brings its own arguments: the default `-il`
/// is right for zsh/bash and wrong for, say, `nu` or a wrapper script, so it is
/// not silently carried over.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn pty_spawn(
    app: AppHandle,
    window: tauri::Window,
    state: State<PtyState>,
    id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    shell: Option<String>,
    shell_args: Option<Vec<String>>,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(size(rows, cols))
        .map_err(|e| e.to_string())?;

    let (default_exe, default_args) = default_shell();
    let chosen = shell.filter(|s| !s.trim().is_empty());
    let args: Vec<String> = match &chosen {
        Some(_) => shell_args.unwrap_or_default(),
        None => default_args.iter().map(|a| (*a).to_string()).collect(),
    };
    let mut cmd = CommandBuilder::new(chosen.unwrap_or(default_exe));
    for arg in args {
        cmd.arg(arg);
    }
    if !cwd.is_empty() {
        cmd.cwd(&cwd);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // The shell re-derives PATH from the user's profile, but it *keeps* what it
    // inherits — which is how the bundled `reado` stays reachable in a terminal
    // whose profile never adds `~/.local/bin`. Without it an agent launched here
    // can't start the MCP server it is told to call.
    cmd.env("PATH", crate::proc::login_shell_path());

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
    state.sessions.lock().unwrap().insert(
        id.clone(),
        Session {
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            child,
            window: window.label().to_string(),
        },
    );

    // Anything typed into this pane before its shell existed has been waiting;
    // deliver it now, before the first byte of output comes back.
    if let Some(text) = state.take_held(&id) {
        // The writer handle is cloned out from under the registry lock, which
        // is released at the end of this statement — the same rule `pty_write`
        // follows, and for the same reason.
        let writer = state
            .sessions
            .lock()
            .unwrap()
            .get(&id)
            .map(|session| Arc::clone(&session.writer));
        if let Some(writer) = writer {
            let mut writer = writer.lock().unwrap();
            let _ = writer.write_all(text.as_bytes());
            let _ = writer.flush();
        }
    }

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
                    let removed = app
                        .state::<PtyState>()
                        .sessions
                        .lock()
                        .unwrap()
                        .remove(&exit_id);
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
///
/// Input for a pane whose shell has not spawned yet is held rather than dropped;
/// see [`PtyState`]. The caller does not have to know which case it is in, which
/// is the point — every one that did know had to remember, and one of them
/// forgot.
#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    write_or_hold(&state, id, &data)
}

/// The body of [`pty_write`], over a plain reference so a test can drive it —
/// the branch that matters here is the one that is *not* taken in a test that
/// only exercises the waiting room.
fn write_or_hold(state: &PtyState, id: String, data: &str) -> Result<(), String> {
    // Grab the writer handle under the registry lock, then drop that lock before
    // writing: the PTY master is blocking, so a full input buffer (a paused or
    // non-reading TUI) must not stall every other terminal — nor app exit, which
    // contends on this same lock.
    let writer = match state.sessions.lock().unwrap().get(&id) {
        Some(session) => Arc::clone(&session.writer),
        None => {
            state.hold(id, data);
            return Ok(());
        }
    };
    let mut writer = writer.lock().unwrap();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    let _ = writer.flush();
    Ok(())
}

/// Resize a session's PTY to match the rendered terminal.
#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(session) = state.sessions.lock().unwrap().get(&id) {
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

/// The command line running in the foreground of a pane's tty — `claude …`,
/// `zsh`, `cargo test …` — or `None` when the pane has no session (or on
/// Windows, which has no tty process group to ask).
///
/// Whether an agent is running in a pane is a fact about the tty, and not
/// something Reado can know from having launched one: the user starts agents
/// themselves and quits them without telling us. Asking the OS is the only
/// answer that is right in both directions — an agent we never launched, and one
/// that has since exited.
#[tauri::command]
pub fn pty_foreground(state: State<PtyState>, id: String) -> Option<String> {
    #[cfg(unix)]
    {
        let pgrp = {
            let sessions = state.sessions.lock().ok()?;
            sessions.get(&id)?.master.process_group_leader()?
        };
        // The whole command line, not the process name: an agent CLI is usually
        // a script run by its interpreter, so `comm` says "node" where `args`
        // says which agent it is.
        let out = crate::proc::command("ps")
            .args(["-o", "args=", "-p", &pgrp.to_string()])
            .output()
            .ok()?;
        let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (!line.is_empty()).then_some(line)
    }
    #[cfg(not(unix))]
    {
        let _ = (state, id);
        None
    }
}

/// Kill a session and drop it from the registry.
#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    if let Some(mut session) = state.sessions.lock().unwrap().remove(&id) {
        crate::log::info("pty", "killed", serde_json::json!({ "id": id }));
        terminate(&mut session);
    }
    Ok(())
}

/// Terminate every live session — called when the app is exiting so no shell or
/// dev server outlives Reado.
pub fn kill_all(state: &PtyState) {
    if let Ok(mut map) = state.sessions.lock() {
        for (_, mut session) in map.drain() {
            terminate(&mut session);
        }
    }
}

/// Terminate every session owned by `window` — called when that window closes so
/// its shells/dev servers don't linger as orphans while the app keeps running.
pub fn kill_for_window(state: &PtyState, window: &str) {
    if let Ok(mut map) = state.sessions.lock() {
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

#[cfg(test)]
mod pending_tests {
    use super::*;

    // A pane exists in the layout before its shell does, and `pty_write` into
    // that gap used to succeed while writing nowhere — which is how a test run
    // and a task could both look wired up and never start.
    #[test]
    fn input_for_an_unspawned_pane_waits_and_is_delivered_once() {
        let state = PtyState::default();
        // Through the command's own body, not the waiting room directly: what
        // this is pinning is that a write with no session *reaches* it.
        write_or_hold(&state, "p1".into(), "npx vitest run").unwrap();
        write_or_hold(&state, "p1".into(), "\r").unwrap();
        assert_eq!(state.take_held("p1").as_deref(), Some("npx vitest run\r"));
        // Taken once: the shell has it now.
        assert_eq!(state.take_held("p1"), None);
    }

    #[test]
    fn a_pane_that_wrote_nothing_holds_nothing() {
        let state = PtyState::default();
        assert_eq!(state.take_held("p2"), None);
        state.hold("p3".into(), "");
        assert_eq!(state.take_held("p3"), None);
    }

    #[test]
    fn what_is_held_is_capped() {
        // A pane that never spawns must not keep a paste buffer alive for the
        // whole session.
        let state = PtyState::default();
        state.hold("p4".into(), &"x".repeat(MAX_PENDING_BYTES));
        state.hold("p4".into(), "one byte too many");
        assert_eq!(
            state.take_held("p4").map(|t| t.len()),
            Some(MAX_PENDING_BYTES)
        );
    }

    #[test]
    fn panes_do_not_share_a_waiting_room() {
        let state = PtyState::default();
        state.hold("a".into(), "for a");
        state.hold("b".into(), "for b");
        assert_eq!(state.take_held("a").as_deref(), Some("for a"));
        assert_eq!(state.take_held("b").as_deref(), Some("for b"));
    }
}
