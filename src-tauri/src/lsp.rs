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
    // Vue runs on typescript-language-server, but only the plugin can actually
    // serve a `.vue` file — without it the server would attach and answer
    // nothing, which reads as "installed and broken" rather than "not installed".
    if server == "vue" && vue_plugin(root).is_none() {
        return false;
    }
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

/// A TypeScript to serve a project with, and how it has to be run.
///
/// TypeScript 7 is the native compiler: it ships no `tsserver.js` at all, so
/// `typescript-language-server` — which drives that file — loads a stub, reports
/// itself as version 1.0.0 and advertises no completion provider. Installed,
/// running, and useless. What it ships instead is an LSP server in the compiler
/// itself (`tsc --lsp -stdio`). A TypeScript ≤ 6 is the other way round: it has
/// the `tsserver.js`, and the server must be pointed at it.
enum Ts {
    /// TypeScript 7: the compiler is the language server (`tsc --lsp -stdio`).
    Lsp(String),
    /// TypeScript ≤ 6: the `tsserver.js` to hand the server as `tsserver.path`.
    Tsserver(String),
}

/// The TypeScript in `dir`'s own `node_modules`, if it has one.
fn typescript_in(dir: &std::path::Path) -> Option<Ts> {
    let tsserver = dir.join("node_modules/typescript/lib/tsserver.js");
    if tsserver.is_file() {
        return Some(Ts::Tsserver(tsserver.to_string_lossy().into_owned()));
    }
    // No tsserver.js, but a `tsc`: a TypeScript 7, which answers LSP itself.
    let bin = dir.join("node_modules/.bin/tsc");
    bin.is_file()
        .then(|| Ts::Lsp(bin.to_string_lossy().into_owned()))
}

/// How far below the opened root to look for a project, and how many directories
/// that search may read before giving up. A monorepo keeps its packages a level
/// or two down (`apps/web`, `packages/ui`, `crates/core`); the caps keep a deep
/// tree from turning "open a folder" into a full crawl.
const SEARCH_DEPTH: u32 = 3;
const SEARCH_DIRS: usize = 500;

/// The projects *under* the opened root that `f` recognises, nearest first, at
/// most `limit` of them.
///
/// Opening the repository root of a monorepo is the normal way to work on one,
/// and that root frequently holds no project itself — the packages do. Language
/// servers look in the root they are given and nowhere else, so several of them
/// came up empty there (see `workspace_typescript` and `lsp_init_options`).
///
/// A hit is not descended into: what lives inside a package is that package's
/// business, and a nested `Cargo.toml` handed to rust-analyzer next to the
/// workspace that owns it is an error, not extra coverage.
fn find_under<T>(root: &str, limit: usize, f: impl Fn(&std::path::Path) -> Option<T>) -> Vec<T> {
    let mut found = Vec::new();
    // Breadth-first, so a package nearer the root wins over a deeper one.
    let mut queue = std::collections::VecDeque::from([(std::path::PathBuf::from(root), 0u32)]);
    let mut read = 0usize;
    while let Some((dir, depth)) = queue.pop_front() {
        if depth > 0 {
            if let Some(hit) = f(&dir) {
                found.push(hit);
                if found.len() >= limit {
                    break;
                }
                continue;
            }
        }
        if depth == SEARCH_DEPTH || read >= SEARCH_DIRS {
            continue;
        }
        read += 1;
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            // Skip what can never hold a project of this repo's, and what is
            // expensive to walk: dotdirs, dependencies, build output.
            if name.starts_with('.')
                || matches!(
                    &*name,
                    "node_modules" | "dist" | "build" | "out" | "target" | "vendor" | "coverage"
                )
            {
                continue;
            }
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                queue.push_back((entry.path(), depth + 1));
            }
        }
    }
    found
}

/// The TypeScript of a package under the opened root — a monorepo's own, which
/// is the one that has to serve it: a workspace on 4.6 gets 4.6, not whatever
/// `tsc` happens to be on PATH.
fn workspace_typescript(root: &str) -> Option<Ts> {
    find_under(root, 1, typescript_in).pop()
}

/// A TypeScript next to the `tsc` on PATH — the last resort, for a project that
/// has none of its own anywhere.
fn global_typescript() -> Option<Ts> {
    let bin = crate::proc::which("tsc")?;
    // `<prefix>/bin/tsc` is a shim onto
    // `<prefix>/lib/node_modules/typescript/bin/tsc`; resolve it to reach the
    // package, and look inside for the `tsserver.js` only a TS ≤ 6 ships.
    let real = std::fs::canonicalize(&bin).unwrap_or_else(|_| bin.clone());
    let pkg = real.parent()?.parent()?;
    let tsserver = pkg.join("lib/tsserver.js");
    Some(if tsserver.is_file() {
        Ts::Tsserver(tsserver.to_string_lossy().into_owned())
    } else {
        Ts::Lsp(bin.to_string_lossy().into_owned())
    })
}

/// The TypeScript that serves `cwd`: always the project's own if it has one —
/// the root's, then a package's under it — before anything installed on the
/// machine. Which server that means follows from the TypeScript, never from the
/// file or from anything the webview says.
fn typescript_for(cwd: &str) -> Option<Ts> {
    typescript_in(std::path::Path::new(cwd))
        .or_else(|| workspace_typescript(cwd))
        // `tsgo`, the standalone preview of the TypeScript 7 server, on PATH.
        .or_else(|| on_path("tsgo").then(|| Ts::Lsp("tsgo".into())))
        .or_else(global_typescript)
}

/// The `initializationOptions` a server needs, for the client to put in its
/// `initialize` request.
///
/// typescript-language-server looks for a TypeScript in the workspace *root*
/// only. A monorepo keeps it in a package, so the server found none and exited
/// during `initialize` ("Could not find a valid TypeScript installation…"),
/// leaving every file in the repo with an error and no completion.
/// `tsserver.path` is the one way to point it at the right one — the CLI flag
/// that used to do it is gone from recent versions.
#[tauri::command]
pub fn lsp_init_options(server: String, root: String) -> Option<serde_json::Value> {
    match server.as_str() {
        "typescript" => match typescript_for(&root) {
            Some(Ts::Tsserver(path)) => Some(serde_json::json!({ "tsserver": { "path": path } })),
            _ => None,
        },
        // The plugin is what serves a `.vue` file, and tsserver only loads it if
        // it is named here — with the TypeScript it should run, since a Vue
        // project's own is the one that knows its types.
        "vue" => {
            let plugin = vue_plugin(&root)?;
            let mut opts = serde_json::json!({
                "plugins": [{
                    "name": "@vue/typescript-plugin",
                    "location": plugin,
                    "languages": ["vue"],
                }]
            });
            if let Some(Ts::Tsserver(path)) = typescript_for(&root) {
                opts["tsserver"] = serde_json::json!({ "path": path });
            }
            Some(opts)
        }
        // rust-analyzer discovers a Cargo workspace in the root it is given and
        // nowhere else. Opened above the crates — the usual shape of a repo that
        // is not only Rust — it answered "Failed to discover workspace" and served
        // nothing at all: no completion, no types, no go-to-definition. It names
        // the remedy in that very message, so hand it the manifests.
        "rust" => {
            if std::path::Path::new(&root).join("Cargo.toml").is_file() {
                return None; // it finds this one by itself
            }
            let manifests = find_under(&root, MAX_LINKED_PROJECTS, |dir| {
                let manifest = dir.join("Cargo.toml");
                manifest
                    .is_file()
                    .then(|| manifest.to_string_lossy().into_owned())
            });
            (!manifests.is_empty()).then(|| serde_json::json!({ "linkedProjects": manifests }))
        }
        _ => None,
    }
}

/// How many Cargo workspaces to hand rust-analyzer from one opened folder. Each
/// one costs a `cargo metadata` and an index; a repo with more Rust than this
/// under the folder you opened is better opened at the workspace itself.
const MAX_LINKED_PROJECTS: usize = 8;

/// The Angular project that owns `file`: the nearest directory at or above it
/// (never above `root`) with an `angular.json`.
///
/// Reado looked for that file in the opened root and nowhere else, so a monorepo
/// with its app a level down — `apps/admin` — was not an Angular project at all,
/// and every component `.ts` went to the plain TypeScript server: no templates,
/// no directives, no Angular anything. Walking up from the file also keeps a
/// monorepo holding several Angular apps honest, each served as its own project.
#[tauri::command]
pub fn angular_root(root: String, file: String) -> Option<String> {
    let root = std::fs::canonicalize(&root).ok()?;
    let mut dir = std::fs::canonicalize(&file).ok()?;
    dir.pop(); // the file's directory
    loop {
        if dir.join("angular.json").is_file() {
            return Some(dir.to_string_lossy().into_owned());
        }
        if dir == root || !dir.pop() {
            return None;
        }
    }
}

/// The `@vue/typescript-plugin` directory, which is what actually serves a
/// `.vue` file.
///
/// `@vue/language-server` 3 is hybrid-only: it holds no TypeScript of its own and
/// relays every type question to a tsserver over a client-mediated channel
/// (`tsserver/request`), so run alone it answers nothing — no completion, no
/// hover, no diagnostics, which is exactly what Reado got out of it. The half
/// that does the work is this plugin, loaded into tsserver, and
/// `typescript-language-server` can load it: with it, a `.vue` file gets the
/// script block's completions *and* the template's, with the `<script setup>`
/// bindings in scope.
fn vue_plugin(root: &str) -> Option<String> {
    let in_dir = |dir: &std::path::Path| {
        let p = dir.join("node_modules/@vue/typescript-plugin");
        p.is_dir().then(|| p.to_string_lossy().into_owned())
    };
    in_dir(std::path::Path::new(root))
        .or_else(|| find_under(root, 1, in_dir).pop())
        .or_else(global_vue_plugin)
}

/// The same plugin installed globally: npm puts a package's own directory beside
/// the binaries it links, so the prefix of any of them leads to it.
fn global_vue_plugin() -> Option<String> {
    let bin = crate::proc::which("vue-language-server")
        .or_else(|| crate::proc::which("typescript-language-server"))?;
    let prefix = bin.parent()?.parent()?;
    // `<prefix>/lib/node_modules` everywhere but Windows, where npm drops the
    // `lib`.
    ["lib/node_modules", "node_modules"]
        .iter()
        .map(|d| prefix.join(d).join("@vue/typescript-plugin"))
        .find(|p| p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Where the Angular server should look for `typescript` and
/// `@angular/language-service`: the package that has them. Falls back to the
/// opened root, which is also the answer for a plain single-package project.
fn angular_probe(cwd: &str) -> String {
    let has_service = |dir: &std::path::Path| {
        dir.join("node_modules/@angular/language-service")
            .is_dir()
            .then(|| dir.to_string_lossy().into_owned())
    };
    has_service(std::path::Path::new(cwd))
        .or_else(|| find_under(cwd, 1, has_service).pop())
        .unwrap_or_else(|| cwd.to_string())
}

/// The command + args for a known language server. The frontend may only ask
/// for a server by name — the actual binary is chosen here, so a compromised
/// webview can't turn `lsp_start` into an arbitrary-command primitive.
///
/// `cwd` is the project root: a couple of servers are chosen by what the project
/// itself has (see `typescript_in`), never by anything the webview says.
fn server_command(server: &str, cwd: &str) -> Option<(String, Vec<String>)> {
    let pair = |bin: &str, args: &[&str]| {
        Some((
            bin.to_string(),
            args.iter().map(|a| (*a).to_string()).collect::<Vec<_>>(),
        ))
    };
    match server {
        "typescript" => match typescript_for(cwd) {
            Some(Ts::Lsp(tsc)) => Some((tsc, vec!["--lsp".into(), "-stdio".into()])),
            // A TS ≤ 6 is driven by typescript-language-server, which is told
            // *which* tsserver.js in `lsp_init_options` — it has no flag for it.
            // With nothing found anywhere, start it anyway: its own error is a
            // better one than ours, and installing a TypeScript then fixes it.
            Some(Ts::Tsserver(_)) | None => pair("typescript-language-server", &["--stdio"]),
        },
        // Vue: typescript-language-server carrying `@vue/typescript-plugin` —
        // see `vue_plugin` for why the Vue server itself is not what runs.
        "vue" => pair("typescript-language-server", &["--stdio"]),
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
    // @angular/language-service — the project's own node_modules, which in a
    // monorepo is a package's, not the opened root's.
    if server == "angular" {
        let probe = angular_probe(&cwd);
        for flag in ["--tsProbeLocations", "--ngProbeLocations"] {
            args.push(flag.to_string());
            args.push(probe.clone());
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
        // A copy for the frontend's Output panel: the file log has always had
        // these lines, but "why won't this server start" is a question you ask
        // inside the app, not in a JSON-lines file in Application Support.
        let err_app = app.clone();
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
                let line = truncate_stderr(&line);
                crate::log::debug(
                    "lsp",
                    "server stderr",
                    serde_json::json!({ "id": err_id.as_str(), "line": line.as_str() }),
                );
                let _ = err_app.emit(
                    "lsp-stderr",
                    serde_json::json!({ "id": err_id.as_str(), "line": line }),
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
    fn a_monorepo_is_served_by_the_typescript_of_a_package_under_it() {
        // Opening the repo root is how you work on a monorepo, and the root has
        // no node_modules of its own — the packages do. That project's TypeScript
        // (4.6 here) must serve it, not whatever `tsc` is installed on the machine.
        let dir = std::env::temp_dir().join(format!("reado-mono-{}", std::process::id()));
        let lib = dir.join("apps/web/node_modules/typescript/lib");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("tsserver.js"), "").unwrap();
        // Decoys the search must not pick up or trip over.
        std::fs::create_dir_all(dir.join("node_modules/typescript")).unwrap();
        std::fs::create_dir_all(dir.join(".git/objects")).unwrap();

        let root = dir.to_string_lossy().into_owned();
        let (cmd, args) = server_command("typescript", &root).unwrap();
        assert_eq!(cmd, "typescript-language-server");
        assert_eq!(args, vec!["--stdio"]);
        // …pointed at that package's tsserver, since it looks only in the root.
        assert_eq!(
            lsp_init_options("typescript".into(), root.clone()),
            Some(serde_json::json!({
                "tsserver": { "path": lib.join("tsserver.js").to_string_lossy() }
            }))
        );

        // A package on TypeScript 7 answers with its own compiler instead.
        std::fs::remove_dir_all(dir.join("apps")).unwrap();
        let pkg = dir.join("packages/ui/node_modules");
        std::fs::create_dir_all(pkg.join("typescript/lib")).unwrap();
        std::fs::create_dir_all(pkg.join(".bin")).unwrap();
        std::fs::write(pkg.join(".bin/tsc"), "#!/bin/sh\n").unwrap();
        let (cmd, args) = server_command("typescript", &root).unwrap();
        assert!(cmd.ends_with("packages/ui/node_modules/.bin/tsc"), "{cmd}");
        assert_eq!(args, vec!["--lsp", "-stdio"]);
        assert_eq!(lsp_init_options("typescript".into(), root), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_project_with_no_typescript_anywhere_falls_back_to_the_global_one() {
        // Whatever this machine has, the fallback never leaves
        // typescript-language-server to hunt for a TypeScript that isn’t there:
        // it either runs the global compiler as the server, or hands the server
        // the global tsserver.js explicitly.
        let dir = std::env::temp_dir().join(format!("reado-noTS-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (cmd, args) = server_command("typescript", &dir.to_string_lossy()).unwrap();
        match global_typescript() {
            Some(Ts::Lsp(tsc)) => {
                assert_eq!(cmd, tsc);
                assert_eq!(args, vec!["--lsp", "-stdio"]);
            }
            Some(Ts::Tsserver(js)) => {
                assert_eq!(cmd, "typescript-language-server");
                assert_eq!(args, vec!["--stdio"]);
                assert_eq!(
                    lsp_init_options("typescript".into(), dir.to_string_lossy().into_owned()),
                    Some(serde_json::json!({ "tsserver": { "path": js } }))
                );
            }
            None => assert_eq!(cmd, "typescript-language-server"),
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_monorepo_hands_rust_analyzer_the_crates_under_it() {
        // Opened above the crates, rust-analyzer answers "Failed to discover
        // workspace" and serves nothing; the manifests are what it asks for.
        let dir = std::env::temp_dir().join(format!("reado-cargo-{}", std::process::id()));
        let ws = dir.join("crates/app");
        std::fs::create_dir_all(ws.join("src")).unwrap();
        std::fs::write(ws.join("Cargo.toml"), "[package]\nname = \"app\"\n").unwrap();
        // A member of that workspace: handing it over *as well* is the error
        // rust-analyzer reports as "believes it's in a workspace when it's not".
        std::fs::create_dir_all(ws.join("sub")).unwrap();
        std::fs::write(ws.join("sub/Cargo.toml"), "[package]\nname = \"sub\"\n").unwrap();
        let root = dir.to_string_lossy().into_owned();

        assert_eq!(
            lsp_init_options("rust".into(), root.clone()),
            Some(serde_json::json!({
                "linkedProjects": [ws.join("Cargo.toml").to_string_lossy()]
            }))
        );

        // A root that is itself a Cargo workspace needs no help.
        std::fs::write(dir.join("Cargo.toml"), "[workspace]\n").unwrap();
        assert_eq!(lsp_init_options("rust".into(), root), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_angular_server_probes_the_package_that_has_the_language_service() {
        let dir = std::env::temp_dir().join(format!("reado-ng-{}", std::process::id()));
        let app = dir.join("apps/web");
        std::fs::create_dir_all(app.join("node_modules/@angular/language-service")).unwrap();
        // Nothing in the root: without the search the server would probe here and
        // report the Angular language service as unavailable.
        assert_eq!(angular_probe(&dir.to_string_lossy()), app.to_string_lossy());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_angular_project_is_the_nearest_one_above_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let app = root.join("apps/admin");
        std::fs::create_dir_all(app.join("src")).unwrap();
        std::fs::write(app.join("angular.json"), "{}").unwrap();
        let file = app.join("src/app.ts");
        std::fs::write(&file, "").unwrap();
        let canon = |p: &std::path::Path| std::fs::canonicalize(p).unwrap();
        let s = |p: &std::path::Path| p.to_string_lossy().into_owned();

        assert_eq!(
            angular_root(s(root), s(&file)),
            Some(s(&canon(&app))),
            "the app a level down is still an Angular project"
        );

        // A file outside any app is not Angular's, however many apps the repo has.
        let other = root.join("packages/util");
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("index.ts"), "").unwrap();
        assert_eq!(angular_root(s(root), s(&other.join("index.ts"))), None);

        // The walk stops at the opened root: an angular.json above it is not
        // this project's, and its server would be rooted outside the workspace.
        let outside = root.join("outside");
        std::fs::create_dir_all(outside.join("src")).unwrap();
        std::fs::write(root.join("angular.json"), "{}").unwrap();
        std::fs::write(outside.join("src/a.ts"), "").unwrap();
        assert_eq!(
            angular_root(s(&outside), s(&outside.join("src/a.ts"))),
            None,
            "never above the opened root"
        );
    }

    #[test]
    fn a_vue_file_is_served_by_tsserver_carrying_the_vue_plugin() {
        // @vue/language-server 3 relays every type question to a tsserver and
        // answers nothing on its own; the plugin is the half that works.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let app = root.join("apps/web/node_modules");
        std::fs::create_dir_all(app.join("@vue/typescript-plugin")).unwrap();
        std::fs::create_dir_all(app.join("typescript/lib")).unwrap();
        std::fs::write(app.join("typescript/lib/tsserver.js"), "").unwrap();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        let r = s(root.to_path_buf());

        let (cmd, args) = server_command("vue", &r).unwrap();
        assert_eq!(
            (cmd.as_str(), args),
            ("typescript-language-server", vec!["--stdio".into()])
        );
        assert_eq!(
            lsp_init_options("vue".into(), r.clone()),
            Some(serde_json::json!({
                "plugins": [{
                    "name": "@vue/typescript-plugin",
                    "location": s(app.join("@vue/typescript-plugin")),
                    "languages": ["vue"],
                }],
                // …running the project's own TypeScript, which knows its types.
                "tsserver": { "path": s(app.join("typescript/lib/tsserver.js")) },
            }))
        );
        // Availability asks one more question than the above: is the server
        // binary installed? That is a property of the machine — CI has no
        // `typescript-language-server` — so what is pinned here is the gate, not
        // the answer: with the plugin in place, Vue is available exactly when the
        // binary is.
        assert_eq!(
            server_available("vue", &r),
            crate::proc::on_path("typescript-language-server")
        );

        // Without the plugin the server would attach and answer nothing, which
        // is worse than reporting Vue as not installed.
        std::fs::remove_dir_all(app.join("@vue")).unwrap();
        assert!(!server_available("vue", &r) || global_vue_plugin().is_some());
    }

    #[test]
    fn unknown_server_has_no_command() {
        assert!(server_command("cobol", "/nowhere").is_none());
        assert!(server_command("rust", "/nowhere").is_some());
    }
}
