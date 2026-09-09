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

/// Whether a language server is available for `root`.
///
/// "Available" is not always "on PATH": a project on TypeScript 7 answers with
/// its own compiler, out of its own `node_modules`, and that is an absolute path.
fn server_available(server: &str, root: &str) -> bool {
    match server_command(server, root) {
        Some((bin, _)) if bin.contains(std::path::MAIN_SEPARATOR) => {
            std::path::Path::new(&bin).is_file()
        }
        Some((bin, _)) => on_path(&bin),
        None => false,
    }
}

/// Whether a known language server is installed for this project.
#[tauri::command]
pub fn lsp_installed(server: String, root: String) -> bool {
    server_available(&server, &root)
}

/// The same answer for every server Reado knows, in one call.
///
/// Each probe walks the login-shell PATH with a `stat` per directory, and the
/// marketplace asks about all of them at once — as two dozen separate commands
/// that was two dozen IPC round trips and a few hundred stats every time the
/// panel mounted.
#[tauri::command]
pub fn lsp_installed_all(root: String) -> Vec<(String, bool)> {
    SERVER_IDS
        .iter()
        .map(|id| ((*id).to_string(), server_available(id, &root)))
        .collect()
}

/// Every server id the allowlist answers for. Kept beside `server_command` so
/// the two cannot drift; the test below pins that.
const SERVER_IDS: &[&str] = &[
    "typescript",
    "angular",
    "rust",
    "python",
    "go",
    "cpp",
    "bash",
    "csharp",
    "java",
    "kotlin",
    "scala",
    "ruby",
    "php",
    "lua",
    "swift",
    "zig",
    "html",
    "css",
    "json",
    "yaml",
    "vue",
    "svelte",
    "solidity",
    "terraform",
    "toml",
];

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

/// TypeScript's own language server, for a project on TypeScript 7.
///
/// TypeScript 7 is the native compiler: `node_modules/typescript/lib` no longer
/// contains a `tsserver.js` at all, so `typescript-language-server` — which
/// drives that file — loads a stub, reports itself as version 1.0.0 and
/// advertises no completion provider. Installed, running, and useless: no
/// diagnostics, no completions, no imports.
///
/// What TypeScript 7 ships instead is an LSP server in the compiler itself
/// (`tsc --lsp -stdio`). It is the project's own binary, resolved from the
/// project's own `node_modules` — the same trust as the `tsc` the project builds
/// with, and the same thing every other editor does with a workspace TypeScript.
fn project_tsgo(cwd: &str) -> Option<String> {
    let root = std::path::Path::new(cwd);
    // TS ≤ 6 keeps a tsserver here; that is typescript-language-server's job.
    if root
        .join("node_modules/typescript/lib/tsserver.js")
        .is_file()
    {
        return None;
    }
    let bin = root.join("node_modules/.bin/tsc");
    bin.is_file().then(|| bin.to_string_lossy().into_owned())
}

/// The command + args for a known language server. The frontend may only ask
/// for a server by name — the actual binary is chosen here, so a compromised
/// webview can't turn `lsp_start` into an arbitrary-command primitive.
///
/// `cwd` is the project root: a couple of servers are chosen by what the project
/// itself has (see `project_tsgo`), never by anything the webview says.
fn server_command(server: &str, cwd: &str) -> Option<(String, Vec<String>)> {
    let pair = |bin: &str, args: &[&str]| {
        Some((
            bin.to_string(),
            args.iter().map(|a| (*a).to_string()).collect::<Vec<_>>(),
        ))
    };
    match server {
        // TypeScript 7 answers LSP itself; older projects go through
        // typescript-language-server, and so does a project with no node_modules
        // at all (where there is nothing of the project's to prefer).
        "typescript" => match project_tsgo(cwd) {
            Some(tsc) => Some((tsc, vec!["--lsp".into(), "-stdio".into()])),
            // `tsgo`, the standalone preview of the same server, if it is on PATH.
            None if on_path("tsgo") => pair("tsgo", &["--lsp", "-stdio"]),
            None => pair("typescript-language-server", &["--stdio"]),
        },
        "angular" => pair("ngserver", &["--stdio"]),
        "rust" => pair("rust-analyzer", &[]),
        "python" => pair("pyright-langserver", &["--stdio"]),
        "go" => pair("gopls", &[]),
        "cpp" => pair("clangd", &[]),
        "bash" => pair("bash-language-server", &["start"]),
        "csharp" => pair("csharp-ls", &[]),
        "java" => pair("jdtls", &[]),
        // Prefer JetBrains' official kotlin-lsp (far stronger analysis and
        // go-to-definition) when it's on PATH; fall back to the older, weaker
        // fwcd kotlin-language-server otherwise. Expose the official launcher as
        // `kotlin-lsp` on PATH to opt in.
        "kotlin" => {
            if on_path("kotlin-lsp") {
                pair("kotlin-lsp", &["--stdio"])
            } else {
                pair("kotlin-language-server", &[])
            }
        }
        "scala" => pair("metals", &[]),
        "ruby" => pair("ruby-lsp", &[]),
        "php" => pair("intelephense", &["--stdio"]),
        "lua" => pair("lua-language-server", &[]),
        "swift" => pair("sourcekit-lsp", &[]),
        "zig" => pair("zls", &[]),
        "html" => pair("vscode-html-language-server", &["--stdio"]),
        "css" => pair("vscode-css-language-server", &["--stdio"]),
        "json" => pair("vscode-json-language-server", &["--stdio"]),
        "yaml" => pair("yaml-language-server", &["--stdio"]),
        "vue" => pair("vue-language-server", &["--stdio"]),
        "svelte" => pair("svelteserver", &["--stdio"]),
        "solidity" => pair("solidity-ls", &["--stdio"]),
        "terraform" => pair("terraform-ls", &["serve"]),
        "toml" => pair("taplo", &["lsp", "stdio"]),
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
    let (command, base_args) = server_command(&server, &cwd).ok_or_else(|| {
        crate::log::warn(
            "lsp",
            "unknown server requested",
            serde_json::json!({ "server": server }),
        );
        format!("unknown server: {server}")
    })?;
    if !server_available(&server, &cwd) {
        crate::log::warn(
            "lsp",
            "server binary not installed",
            serde_json::json!({ "server": server, "binary": command }),
        );
    }
    let mut args: Vec<String> = base_args;
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
    let mut child = crate::proc::command(&command)
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

    #[test]
    fn every_listed_id_resolves_to_a_command() {
        // `lsp_installed_all` iterates the id list; an id the allowlist doesn't
        // know would silently report "not installed" forever.
        for id in SERVER_IDS {
            assert!(
                server_command(id, "/nowhere").is_some(),
                "{id} has no command"
            );
        }
    }
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
    fn a_typescript_7_project_answers_with_its_own_compiler() {
        // TS 7 dropped `tsserver.js`, which is the only thing
        // typescript-language-server can drive: on such a project it runs but
        // offers nothing at all, so the project's own LSP-speaking compiler wins.
        let dir = std::env::temp_dir().join(format!("reado-ts7-{}", std::process::id()));
        let bin = dir.join("node_modules/.bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("tsc"), "#!/bin/sh\n").unwrap();
        let root = dir.to_string_lossy().into_owned();

        let (cmd, args) = server_command("typescript", &root).unwrap();
        assert!(cmd.ends_with("node_modules/.bin/tsc"), "{cmd}");
        assert_eq!(args, vec!["--lsp", "-stdio"]);
        // …and it counts as installed, though it is nowhere near PATH.
        assert!(server_available("typescript", &root));

        // A project still on TS ≤ 6 keeps the server that can drive its tsserver.
        let lib = dir.join("node_modules/typescript/lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("tsserver.js"), "").unwrap();
        let (cmd, _) = server_command("typescript", &root).unwrap();
        assert!(
            cmd == "typescript-language-server" || cmd == "tsgo",
            "{cmd}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unknown_server_has_no_command() {
        assert!(server_command("cobol", "/nowhere").is_none());
        assert!(server_command("rust", "/nowhere").is_some());
    }
}
