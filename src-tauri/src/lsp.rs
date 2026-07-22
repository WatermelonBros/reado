//! Language Server host.
//!
//! Reado runs language servers as external processes and acts as a dumb pipe
//! between them and the webview: stdout is de-framed (LSP Content-Length) into
//! whole JSON-RPC messages emitted as `lsp-{id}` events; `lsp_send` frames and
//! writes a message to stdin. The CodeMirror LSP client owns the protocol.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::proc::on_path;

/// Whether a known language server's binary is installed (on the resolved PATH).
#[tauri::command]
pub fn lsp_installed(server: String) -> bool {
    server_command(&server).is_some_and(|(bin, _)| on_path(bin))
}

/// The system package manager available on this (Linux) machine, so the
/// marketplace can pick the right install command per distro. Returns one of
/// "apt" | "dnf" | "pacman" | "zypper" | "brew", or null if none is found.
#[tauri::command]
pub fn linux_package_manager() -> Option<String> {
    for (bin, key) in [
        ("apt-get", "apt"),
        ("dnf", "dnf"),
        ("pacman", "pacman"),
        ("zypper", "zypper"),
        ("brew", "brew"),
    ] {
        if on_path(bin) {
            return Some(key.to_string());
        }
    }
    None
}

struct Server {
    child: Child,
    stdin: ChildStdin,
}

/// Cap a single stderr line before it reaches the log — a server can emit huge
/// lines (stack traces, JSON blobs) and the log shouldn't carry them whole.
const MAX_STDERR_LINE: usize = 2000;

/// Upper bound on a single LSP message body. A wedged/hostile server can send a
/// bogus `Content-Length` (e.g. 99999999999999); allocating that blindly aborts
/// the app or panics with 'capacity overflow'. Anything larger than this is
/// treated as a protocol error that ends the pump gracefully. 64 MiB is far above
/// any legitimate response (big completion / semantic-token payloads included).
const MAX_LSP_MESSAGE: usize = 64 * 1024 * 1024;

/// Truncate `line` to `MAX_STDERR_LINE` chars (on a char boundary), appending an
/// ellipsis marker when cut, so an oversized stderr line can't bloat the log.
fn truncate_stderr(line: &str) -> String {
    let trimmed = line.trim_end();
    if trimmed.chars().count() <= MAX_STDERR_LINE {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(MAX_STDERR_LINE).collect();
    format!("{cut}… (truncated)")
}

#[derive(Default)]
pub struct LspState(Mutex<HashMap<String, Server>>);

/// The command + args for a known language server. The frontend may only ask
/// for a server by name — the actual binary is chosen here, so a compromised
/// webview can't turn `lsp_start` into an arbitrary-command primitive.
fn server_command(server: &str) -> Option<(&'static str, Vec<&'static str>)> {
    match server {
        "typescript" => Some(("typescript-language-server", vec!["--stdio"])),
        "angular" => Some(("ngserver", vec!["--stdio"])),
        "rust" => Some(("rust-analyzer", vec![])),
        "python" => Some(("pyright-langserver", vec!["--stdio"])),
        "go" => Some(("gopls", vec![])),
        "cpp" => Some(("clangd", vec![])),
        "bash" => Some(("bash-language-server", vec!["start"])),
        "csharp" => Some(("csharp-ls", vec![])),
        "java" => Some(("jdtls", vec![])),
        // Prefer JetBrains' official kotlin-lsp (far stronger analysis and
        // go-to-definition) when it's on PATH; fall back to the older, weaker
        // fwcd kotlin-language-server otherwise. Expose the official launcher as
        // `kotlin-lsp` on PATH to opt in.
        "kotlin" => Some(if on_path("kotlin-lsp") {
            ("kotlin-lsp", vec!["--stdio"])
        } else {
            ("kotlin-language-server", vec![])
        }),
        "scala" => Some(("metals", vec![])),
        "ruby" => Some(("ruby-lsp", vec![])),
        "php" => Some(("intelephense", vec!["--stdio"])),
        "lua" => Some(("lua-language-server", vec![])),
        "swift" => Some(("sourcekit-lsp", vec![])),
        "zig" => Some(("zls", vec![])),
        "html" => Some(("vscode-html-language-server", vec!["--stdio"])),
        "css" => Some(("vscode-css-language-server", vec!["--stdio"])),
        "json" => Some(("vscode-json-language-server", vec!["--stdio"])),
        "yaml" => Some(("yaml-language-server", vec!["--stdio"])),
        "vue" => Some(("vue-language-server", vec!["--stdio"])),
        "svelte" => Some(("svelteserver", vec!["--stdio"])),
        "solidity" => Some(("solidity-ls", vec!["--stdio"])),
        "terraform" => Some(("terraform-ls", vec!["serve"])),
        "toml" => Some(("taplo", vec!["lsp", "stdio"])),
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
    // Hold the map lock across the whole check-and-reserve: two concurrent starts
    // for the same id (e.g. two windows on one project) must not both spawn a
    // server — the second insert would overwrite and leak the first child. A
    // second call blocks here until the first inserts, then sees the entry below
    // and reuses it. The exit reaper also takes this lock, so the freshly inserted
    // entry can't be removed before it exists.
    let mut map = state.0.lock().unwrap();
    // Already running for this id — reuse.
    if map.contains_key(&id) {
        return Ok(());
    }
    let (command, base_args) = server_command(&server).ok_or_else(|| {
        crate::log::warn(
            "lsp",
            "unknown server requested",
            serde_json::json!({ "server": server }),
        );
        format!("unknown server: {server}")
    })?;
    if !on_path(command) {
        crate::log::warn(
            "lsp",
            "server binary not installed",
            serde_json::json!({ "server": server, "binary": command }),
        );
    }
    let mut args: Vec<String> = base_args.iter().map(|s| (*s).to_string()).collect();
    // The Angular server needs to be told where to find typescript and
    // @angular/language-service — the project's own node_modules (the cwd).
    if server == "angular" {
        for flag in ["--tsProbeLocations", "--ngProbeLocations"] {
            args.push(flag.to_string());
            args.push(cwd.clone());
        }
    }
    // crate::proc::command already runs with the login-shell PATH, so nvm/cargo/
    // brew-installed servers resolve here.
    let mut child = crate::proc::command(command)
        .args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Capture stderr (was discarded) so a failing/crashing server leaves a
        // diagnostic trail in the log instead of failing blind.
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            crate::log::error(
                "lsp",
                "server start failed",
                serde_json::json!({ "server": server, "binary": command, "error": e.to_string() }),
            );
            e.to_string()
        })?;
    crate::log::info(
        "lsp",
        "server started",
        serde_json::json!({ "id": id.as_str(), "server": server, "binary": command }),
    );

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let event = format!("lsp-{id}");
    let exit_id = id.clone();

    // Drain stderr on its own thread so a chatty server never stalls stdout, and
    // each line lands in the log (truncated) under the LSP scope.
    if let Some(stderr) = child.stderr.take() {
        let err_id = id.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            // Drain byte-wise (not `.lines()`): a single non-UTF-8 byte must not
            // end the drain, or the server's stderr pipe fills, its next write()
            // blocks, and it wedges with stdout starved and no exit event. Lossy
            // decode logs the invalid line instead of dropping the whole stream.
            let mut raw = Vec::new();
            loop {
                raw.clear();
                match reader.read_until(b'\n', &mut raw) {
                    Ok(0) | Err(_) => break, // EOF or pipe error → stop draining
                    Ok(_) => {}
                }
                let line = String::from_utf8_lossy(&raw);
                if line.trim().is_empty() {
                    continue;
                }
                crate::log::debug(
                    "lsp",
                    "server stderr",
                    serde_json::json!({ "id": err_id.as_str(), "line": truncate_stderr(&line) }),
                );
            }
        });
    }

    std::thread::spawn(move || {
        // Inner closure so the early `return`s on EOF/error land here and we can
        // log the server's exit exactly once. The pump gets its own AppHandle
        // clone so the outer scope keeps one to emit the exit event afterwards.
        let pump_app = app.clone();
        let pump = move || {
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
                // Guard against a bogus/hostile Content-Length before allocating:
                // `vec![0u8; len]` on a wild value aborts the app or panics, and a
                // panic here would skip the exit-emit below. Ending the pump
                // gracefully lets the frontend learn the server is gone.
                if len > MAX_LSP_MESSAGE {
                    crate::log::error(
                        "lsp",
                        "content-length exceeds cap; ending pump",
                        serde_json::json!({ "event": event.as_str(), "len": len, "cap": MAX_LSP_MESSAGE }),
                    );
                    return;
                }
                let mut buf = vec![0u8; len];
                if reader.read_exact(&mut buf).is_err() {
                    return;
                }
                let _ = pump_app.emit(&event, String::from_utf8_lossy(&buf).into_owned());
            }
        };
        pump();
        // The output stream ended → the process is gone. Drop the now-dead entry
        // from the map (so the next lsp_start re-spawns instead of reusing a dead
        // pipe) and reap the child to avoid a zombie. If lsp_stop already removed
        // it, `remove` is a no-op and the child was reaped there.
        if let Some(mut server) = app.state::<LspState>().0.lock().unwrap().remove(&exit_id) {
            let _ = server.child.wait();
        }
        // Signal the frontend so it can drop the dead connection and recover, then
        // log the exit once.
        let _ = app.emit(&format!("lsp-exit-{exit_id}"), ());
        crate::log::info("lsp", "server exited", serde_json::json!({ "id": exit_id }));
    });

    map.insert(id, Server { child, stdin });
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
        crate::log::info("lsp", "server stopped", serde_json::json!({ "id": id }));
        let _ = server.child.kill();
        // Reap the killed child so it doesn't linger as a <defunct> zombie.
        let _ = server.child.wait();
    }
    Ok(())
}

/// Kill every running server — called when the app exits.
pub fn kill_all(state: &LspState) {
    if let Ok(mut map) = state.0.lock() {
        for (_, mut server) in map.drain() {
            let _ = server.child.kill();
            let _ = server.child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_stderr_line_is_untouched_but_trimmed() {
        assert_eq!(truncate_stderr("boom\r\n"), "boom");
    }

    #[test]
    fn long_stderr_line_is_truncated_with_marker() {
        let line = "x".repeat(MAX_STDERR_LINE + 500);
        let out = truncate_stderr(&line);
        assert!(out.ends_with("… (truncated)"));
        assert_eq!(out.chars().filter(|&c| c == 'x').count(), MAX_STDERR_LINE);
    }

    #[test]
    fn unknown_server_has_no_command() {
        assert!(server_command("cobol").is_none());
        assert!(server_command("rust").is_some());
    }
}
