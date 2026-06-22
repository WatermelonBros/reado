//! Language Server host.
//!
//! Reado runs language servers as external processes and acts as a dumb pipe
//! between them and the webview: stdout is de-framed (LSP Content-Length) into
//! whole JSON-RPC messages emitted as `lsp-{id}` events; `lsp_send` frames and
//! writes a message to stdin. The CodeMirror LSP client owns the protocol.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

struct Server {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct LspState(Mutex<HashMap<String, Server>>);

/// The command + args for a known language server. The frontend may only ask
/// for a server by name — the actual binary is chosen here, so a compromised
/// webview can't turn `lsp_start` into an arbitrary-command primitive.
fn server_command(server: &str) -> Option<(&'static str, Vec<&'static str>)> {
    match server {
        "typescript" => Some(("typescript-language-server", vec!["--stdio"])),
        "rust" => Some(("rust-analyzer", vec![])),
        _ => None,
    }
}

/// Start the language server named `server` (resolved against an allowlist) for
/// connection `id`, running in `cwd`. Its JSON-RPC output is emitted as
/// `lsp-{id}` events (one per message).
#[tauri::command]
pub fn lsp_start(
    app: AppHandle,
    state: State<LspState>,
    id: String,
    server: String,
    cwd: String,
) -> Result<(), String> {
    // Already running for this id — reuse.
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }
    let (command, args) =
        server_command(&server).ok_or_else(|| format!("unknown server: {server}"))?;
    let mut child = Command::new(command)
        .args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let event = format!("lsp-{id}");

    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            // Parse headers up to the blank line; we only need Content-Length.
            let mut len = 0usize;
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => return, // EOF or error → server gone
                    Ok(_) => {}
                }
                let trimmed = line.trim_end();
                if trimmed.is_empty() {
                    break;
                }
                if let Some(v) = trimmed.strip_prefix("Content-Length:") {
                    len = v.trim().parse().unwrap_or(0);
                }
            }
            if len == 0 {
                continue;
            }
            let mut buf = vec![0u8; len];
            if reader.read_exact(&mut buf).is_err() {
                return;
            }
            let _ = app.emit(&event, String::from_utf8_lossy(&buf).into_owned());
        }
    });

    state.0.lock().unwrap().insert(id, Server { child, stdin });
    Ok(())
}

/// Frame and write a JSON-RPC message to server `id`'s stdin.
#[tauri::command]
pub fn lsp_send(state: State<LspState>, id: String, message: String) -> Result<(), String> {
    if let Some(server) = state.0.lock().unwrap().get_mut(&id) {
        let header = format!("Content-Length: {}\r\n\r\n", message.len());
        server
            .stdin
            .write_all(header.as_bytes())
            .and_then(|_| server.stdin.write_all(message.as_bytes()))
            .and_then(|_| server.stdin.flush())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Stop a language server.
#[tauri::command]
pub fn lsp_stop(state: State<LspState>, id: String) -> Result<(), String> {
    if let Some(mut server) = state.0.lock().unwrap().remove(&id) {
        let _ = server.child.kill();
    }
    Ok(())
}

/// Kill every running server — called when the app exits.
pub fn kill_all(state: &LspState) {
    if let Ok(mut map) = state.0.lock() {
        for (_, mut server) in map.drain() {
            let _ = server.child.kill();
        }
    }
}
