//! Reado Anywhere — the opt-in LAN server.
//!
//! The desktop is the brain; a phone is a thin read/comment client that reaches
//! it over the local network. This module hosts a single TLS server (one per
//! app, shared across windows) that, when the user enables Reado Anywhere, serves
//! a self-contained mobile PWA over HTTPS plus a small JSON API.
//!
//! Auth is deliberately simple: the QR carries a session token, and the phone
//! sends it as a `Bearer` credential. The server checks it against the running
//! session's token. Regenerating the server (disable/enable) mints a new token,
//! which revokes every phone. Stable, persisted device credentials are a later
//! refinement.

use crate::proc::command;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use axum_server::Handle;
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State as TauriState};

use reado_core::{
    self as core, ArtifactState, CommentKind, CommentType, FileState, NewComment, Scope,
};

/// A project window currently open on the desktop, as the phone sees it.
#[derive(Clone, Serialize)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    /// Absolute root — server-side only, never serialized to the phone.
    #[serde(skip)]
    pub root: String,
}

/// The open-project registry, shared between the Tauri commands (which populate
/// it as windows open) and the server (which reads it).
type Projects = Arc<Mutex<HashMap<String, ProjectMeta>>>;

/// A recent project the phone can ask the desktop to open. Unlike `ProjectMeta`,
/// the path *is* sent to the phone — it echoes it back to `/api/open`.
#[derive(Clone, Serialize, Deserialize)]
pub struct RecentMeta {
    pub path: String,
    pub name: String,
}

/// The desktop's recent-projects list, pushed from the frontend.
type Recents = Arc<Mutex<Vec<RecentMeta>>>;

/// A live PTY shell, kept alive across reconnects so a phone backgrounding the
/// app (or a wifi blip) doesn't lose its running `claude` session. Output is
/// broadcast to whatever socket is currently attached, plus a rolling scrollback
/// replayed (after a terminal reset) on each (re)attach so the view is a clean
/// mirror. Keyed by project in the registry.
struct TermSession {
    writer: Mutex<Box<dyn std::io::Write + Send>>,
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    tx: tokio::sync::broadcast::Sender<Vec<u8>>,
    scrollback: Mutex<Vec<u8>>,
}

/// Persistent PTY sessions, keyed by project id.
type Terminals = Arc<Mutex<HashMap<String, Arc<TermSession>>>>;

/// What the desktop shows (encoded into the pairing QR) and the phone needs.
#[derive(Serialize, Clone)]
pub struct AnywhereInfo {
    /// `https://<lan-ip>:<port>` — where the phone connects.
    pub url: String,
    /// SHA-256 of the server certificate (uppercase hex, colon-separated).
    pub fingerprint: String,
    /// Session token: the phone sends it back as a `Bearer` credential.
    pub token: String,
}

/// A running server: the info we handed out, plus the handle that shuts it down.
struct Running {
    handle: Handle,
    info: AnywhereInfo,
}

/// The latest resolve-loop state (raw JSON), published by the desktop for paired
/// phones to poll. `reado-anywhere` only carries it; `async-review-loop` produces
/// it. `None` means no loop is active.
type Loop = Arc<Mutex<Option<String>>>;

/// Tauri-managed state: the server, the open-project registry, and the recents.
#[derive(Default)]
pub struct AnywhereState {
    running: Mutex<Option<Running>>,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
}

/// Shared state handed to the axum handlers.
#[derive(Clone)]
struct Api {
    token: String,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
    app: AppHandle,
}

impl Api {
    /// The absolute root for a project id, if it's still open.
    fn root(&self, id: &str) -> Option<String> {
        self.projects.lock().ok()?.get(id).map(|p| p.root.clone())
    }
}

/// rustls needs a process-wide crypto provider installed exactly once.
static CRYPTO: Once = Once::new();
fn install_crypto() {
    CRYPTO.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// An OS-assigned free port (bind to :0, read it back, drop the listener).
fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("0.0.0.0:0")?;
    Ok(listener.local_addr()?.port())
}

/// SHA-256 fingerprint of a DER certificate, as uppercase colon-separated hex.
fn fingerprint(der: &[u8]) -> String {
    let digest = Sha256::digest(der);
    digest
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}

/// A fresh session token (192 random bits, hex).
fn mint_token() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
}

/// Join a project-relative path to its root, rejecting traversal (`..`). An
/// empty `rel` is allowed (it means the root itself).
fn safe_join(root: &str, rel: &str) -> Option<PathBuf> {
    if rel.split(['/', '\\']).any(|c| c == "..") {
        return None;
    }
    Some(Path::new(root).join(rel))
}

// ---- The mobile client (a self-contained PWA, served at `/`) ---------------

const MOBILE_HTML: &str = include_str!("anywhere_mobile.html");
const MANIFEST: &str = r##"{"name":"Reado Anywhere","short_name":"Reado","display":"standalone","background_color":"#1b1f28","theme_color":"#1b1f28","icons":[]}"##;

// xterm.js (+ fit addon + css), vendored into the repo so the phone gets a real
// terminal emulator over the LAN with no internet — and so the build doesn't
// depend on node_modules being present (the Rust CI job doesn't install it).
const XTERM_JS: &str = include_str!("vendor/xterm.js");
const XTERM_CSS: &str = include_str!("vendor/xterm.css");
const XTERM_FIT: &str = include_str!("vendor/addon-fit.js");

/// The single inline `<script>` in the mobile HTML — the whole app logic. The
/// vendor scripts use `<script src=…>`, so the only *bare* `<script>` is the app.
/// Returns the exact text content the browser hashes for the CSP.
fn inline_script() -> &'static str {
    let open = "<script>";
    let start = MOBILE_HTML
        .find(open)
        .map(|i| i + open.len())
        .expect("mobile HTML must contain an inline <script>");
    let end = MOBILE_HTML[start..]
        .find("</script>")
        .map(|i| start + i)
        .expect("inline <script> must be closed");
    &MOBILE_HTML[start..end]
}

/// The Content-Security-Policy for the mobile page. The app logic ships as one
/// inline `<script>`, so `script-src` MUST allow it — we do so by its SHA-256
/// hash (computed from the served HTML, so the policy can never drift from the
/// script) rather than the blunt `'unsafe-inline'`. Without allowing it the
/// browser silently blocks the script and the page renders as an empty shell
/// (header only, empty tab bar and body).
fn content_security_policy() -> String {
    let hash = crate::fs::base64_encode(&Sha256::digest(inline_script().as_bytes()));
    format!(
        "default-src 'self'; script-src 'self' 'sha256-{hash}'; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"
    )
}

/// The login+interactive shell to spawn for a phone terminal, per platform.
fn shell() -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        (
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into()),
            vec![],
        )
    }
    #[cfg(not(windows))]
    {
        (
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()),
            vec!["-il".to_string()],
        )
    }
}

// ---- Server lifecycle ------------------------------------------------------

/// The full pairing URL a phone can open directly (address + token + fingerprint
/// in the fragment). The desktop QR encodes exactly this.
pub fn pairing_url(info: &AnywhereInfo) -> String {
    format!("{}/#token={}&fp={}", info.url, info.token, info.fingerprint)
}

/// Build the cert, bind the TLS server, spawn it, and return its handle + info.
/// Shared by the `anywhere_enable` command and the dev autostart.
async fn start_server(
    app: AppHandle,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
) -> Result<(Handle, AnywhereInfo), String> {
    install_crypto();

    let ip = local_ip_address::local_ip().map_err(|e| e.to_string())?;
    let port = free_port().map_err(|e| e.to_string())?;

    let cert = rcgen::generate_simple_self_signed(vec![ip.to_string(), "localhost".into()])
        .map_err(|e| e.to_string())?;
    let fp = fingerprint(cert.cert.der());
    let config = RustlsConfig::from_pem(
        cert.cert.pem().into_bytes(),
        cert.key_pair.serialize_pem().into_bytes(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let info = AnywhereInfo {
        url: format!("https://{ip}:{port}"),
        fingerprint: fp,
        token: mint_token(),
    };

    let api = Api {
        token: info.token.clone(),
        projects,
        recents,
        terminals,
        loop_state,
        app,
    };

    let protected = Router::new()
        .route("/api/projects", get(list_projects))
        .route("/api/recents", get(list_recents))
        .route("/api/open", post(open_project))
        .route("/api/dir", get(dir))
        .route("/api/file", get(file))
        .route("/api/changed", get(changed))
        .route("/api/diff", get(diff))
        .route("/api/comments", get(comments_get).post(comments_post))
        .route("/api/comment-update", post(comment_update))
        .route("/api/run-agent", post(run_agent))
        .route("/api/prereview", post(prereview))
        .route("/api/loop", get(loop_get))
        .route("/api/sessions", get(sessions_get))
        .route("/api/session-accept", post(session_accept))
        .route("/api/session-discard", post(session_discard))
        .route("/api/session-set-file", post(session_set_file))
        .route("/api/review-action", post(review_action))
        .layer(middleware::from_fn_with_state(api.clone(), auth));

    let js = |body: &'static str, ct: &'static str| {
        get(move || async move { ([(header::CONTENT_TYPE, ct)], body) })
    };
    // Allow the app's inline <script> by its hash (see `content_security_policy`)
    // — computed once here and served on the page.
    let csp = HeaderValue::from_str(&content_security_policy()).expect("valid CSP header");
    let router = Router::new()
        .route(
            "/",
            get(move || {
                let csp = csp.clone();
                async move { ([(header::CONTENT_SECURITY_POLICY, csp)], Html(MOBILE_HTML)) }
            }),
        )
        .route(
            "/manifest.webmanifest",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "application/manifest+json")],
                    MANIFEST,
                )
            }),
        )
        .route("/vendor/xterm.js", js(XTERM_JS, "text/javascript"))
        .route("/vendor/xterm.css", js(XTERM_CSS, "text/css"))
        .route("/vendor/addon-fit.js", js(XTERM_FIT, "text/javascript"))
        // The terminal WebSocket validates its token from the query string
        // (browsers can't set headers on a WS handshake), so it lives outside the
        // bearer-header middleware.
        .route("/api/term", get(term))
        .merge(protected)
        .with_state(api);

    let handle = Handle::new();
    let serve_handle = handle.clone();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    // Note: the cert fingerprint is intentionally not logged — the `fingerprint`
    // field name is on the redaction denylist, so it would only ever write
    // `<redacted>`. The address is enough to confirm the listener came up.
    crate::log::info(
        "anywhere",
        "server starting",
        serde_json::json!({ "addr": addr.to_string() }),
    );
    tauri::async_runtime::spawn(async move {
        let _ = axum_server::bind_rustls(addr, config)
            .handle(serve_handle)
            .serve(router.into_make_service())
            .await;
    });

    Ok((handle, info))
}

/// Start the LAN server (idempotent: returns the existing info if already up).
#[tauri::command]
pub async fn anywhere_enable(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
) -> Result<AnywhereInfo, String> {
    if let Some(running) = state.running.lock().map_err(|e| e.to_string())?.as_ref() {
        return Ok(running.info.clone());
    }
    let (handle, info) = start_server(
        app,
        state.projects.clone(),
        state.recents.clone(),
        state.terminals.clone(),
        state.loop_state.clone(),
    )
    .await?;
    *state.running.lock().map_err(|e| e.to_string())? = Some(Running {
        handle,
        info: info.clone(),
    });
    Ok(info)
}

/// Dev convenience: when `READO_ANYWHERE_AUTOSTART` is set, start the server at
/// launch and print the pairing URL to stdout (so you can open it on a phone
/// without clicking through the UI). No-op otherwise.
pub fn dev_autostart(app: &AppHandle) {
    if std::env::var("READO_ANYWHERE_AUTOSTART").is_err() {
        return;
    }
    use tauri::Manager;
    let state = app.state::<AnywhereState>();
    let projects = state.projects.clone();
    let recents = state.recents.clone();
    let terminals = state.terminals.clone();
    let loop_state = state.loop_state.clone();
    // For testing without clicking the native UI, seed a project from
    // READO_ANYWHERE_PROJECT so the phone has something to browse immediately.
    if let Ok(root) = std::env::var("READO_ANYWHERE_PROJECT") {
        let name = std::path::Path::new(&root)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".into());
        if let Ok(mut p) = projects.lock() {
            p.insert(
                "dev".into(),
                ProjectMeta {
                    id: "dev".into(),
                    name,
                    root,
                },
            );
        }
    }
    match tauri::async_runtime::block_on(start_server(
        app.clone(),
        projects,
        recents,
        terminals,
        loop_state,
    )) {
        Ok((handle, info)) => {
            crate::log::info(
                "anywhere",
                "dev autostart up",
                serde_json::json!({ "url": info.url }),
            );
            // Intentional dev-only stdout (gated by READO_ANYWHERE_AUTOSTART): the
            // pairing URL carries the session token, so it is printed for the
            // developer's terminal but never written to the (shareable) log file.
            println!(
                "\n[reado-anywhere] open on your phone:\n[reado-anywhere] {}\n",
                pairing_url(&info)
            );
            if let Ok(mut g) = state.running.lock() {
                *g = Some(Running { handle, info });
            }
        }
        Err(e) => crate::log::error(
            "anywhere",
            "dev autostart failed",
            serde_json::json!({ "error": e }),
        ),
    }
}

/// Stop the LAN server and drop active connections.
#[tauri::command]
pub fn anywhere_disable(state: TauriState<'_, AnywhereState>) -> Result<(), String> {
    if let Some(running) = state.running.lock().map_err(|e| e.to_string())?.take() {
        running.handle.shutdown();
    }
    Ok(())
}

/// Stop the server on app exit so its task + terminal PTYs don't outlive the app.
pub fn shutdown(state: &AnywhereState) {
    if let Ok(mut g) = state.running.lock() {
        if let Some(r) = g.take() {
            r.handle.shutdown();
        }
    }
    if let Ok(mut map) = state.terminals.lock() {
        for (_, s) in map.drain() {
            if let Ok(mut c) = s.child.lock() {
                #[cfg(windows)]
                if let Some(pid) = c.process_id() {
                    let _ = crate::proc::command("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .output();
                }
                let _ = c.kill();
            }
        }
    }
}

/// The current server info, or `None` when Reado Anywhere is off.
#[tauri::command]
pub fn anywhere_status(
    state: TauriState<'_, AnywhereState>,
) -> Result<Option<AnywhereInfo>, String> {
    Ok(state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|r| r.info.clone()))
}

/// Register (or update) an open project so the phone can pick it.
#[tauri::command]
pub fn anywhere_set_project(
    state: TauriState<'_, AnywhereState>,
    id: String,
    root: String,
    name: String,
) -> Result<(), String> {
    state
        .projects
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), ProjectMeta { id, name, root });
    Ok(())
}

/// Push the desktop's recent-projects list so the phone can open one remotely.
#[tauri::command]
pub fn anywhere_set_recents(
    state: TauriState<'_, AnywhereState>,
    recents: Vec<RecentMeta>,
) -> Result<(), String> {
    *state.recents.lock().map_err(|e| e.to_string())? = recents;
    Ok(())
}

/// Publish (or clear, with `None`) the resolve-loop state for paired phones to
/// poll at `/api/loop`. Carried by Anywhere; produced by `async-review-loop`.
#[tauri::command]
pub fn anywhere_publish_loop(state: TauriState<'_, AnywhereState>, json: Option<String>) {
    if let Ok(mut g) = state.loop_state.lock() {
        *g = json;
    }
}

/// Drop a project from the registry when its window closes.
#[tauri::command]
pub fn anywhere_clear_project(
    state: TauriState<'_, AnywhereState>,
    id: String,
) -> Result<(), String> {
    state
        .projects
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&id);
    Ok(())
}

// ---- Auth middleware -------------------------------------------------------

/// Gate `/api/*` on the session token presented as `Authorization: Bearer …`.
async fn auth(State(api): State<Api>, req: Request, next: Next) -> Response {
    let ok = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t == api.token)
        .unwrap_or(false);
    if ok {
        next.run(req).await
    } else {
        crate::log::warn(
            "anywhere",
            "client auth rejected",
            serde_json::json!({ "path": req.uri().path() }),
        );
        StatusCode::UNAUTHORIZED.into_response()
    }
}

// ---- API handlers ----------------------------------------------------------

async fn list_projects(State(api): State<Api>) -> Json<Vec<ProjectMeta>> {
    let list = api
        .projects
        .lock()
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default();
    Json(list)
}

async fn list_recents(State(api): State<Api>) -> Json<Vec<RecentMeta>> {
    let list = api.recents.lock().map(|r| r.clone()).unwrap_or_default();
    Json(list)
}

#[derive(Deserialize)]
struct OpenBody {
    path: String,
}

/// Ask the desktop to open a project. Only paths already in the recents list are
/// allowed, so a paired phone can't make the desktop open arbitrary folders.
async fn open_project(State(api): State<Api>, Json(b): Json<OpenBody>) -> StatusCode {
    let known = api
        .recents
        .lock()
        .map(|r| r.iter().any(|x| x.path == b.path))
        .unwrap_or(false);
    if !known {
        return StatusCode::FORBIDDEN;
    }
    let _ = api.app.emit("anywhere://open-project", b.path);
    StatusCode::OK
}

#[derive(Deserialize)]
struct DirQuery {
    project: String,
    #[serde(default)]
    path: String,
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    dir: bool,
}

async fn dir(
    State(api): State<Api>,
    Query(q): Query<DirQuery>,
) -> Result<Json<Vec<DirEntry>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let base = safe_join(&root, &q.path).ok_or(StatusCode::BAD_REQUEST)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&base)
        .map_err(|_| StatusCode::NOT_FOUND)?
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let rel = if q.path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", q.path.trim_end_matches('/'), name)
        };
        out.push(DirEntry {
            name,
            path: rel,
            dir: is_dir,
        });
    }
    // Directories first, then files; each alphabetical (case-insensitive).
    out.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(Json(out))
}

#[derive(Deserialize)]
struct FileQuery {
    project: String,
    path: String,
}

async fn file(State(api): State<Api>, Query(q): Query<FileQuery>) -> Result<String, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let p = safe_join(&root, &q.path).ok_or(StatusCode::BAD_REQUEST)?;
    let meta = std::fs::metadata(&p).map_err(|_| StatusCode::NOT_FOUND)?;
    if meta.len() > 2_000_000 {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    std::fs::read_to_string(&p).map_err(|_| StatusCode::UNSUPPORTED_MEDIA_TYPE)
}

#[derive(Deserialize)]
struct ProjectQuery {
    project: String,
}

#[derive(Serialize)]
struct ChangedFile {
    path: String,
    status: String,
}

/// Files changed vs HEAD (porcelain), so the phone can list them like the
/// desktop's git panel and open each one's diff.
async fn changed(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<ChangedFile>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let out = command("git")
        // `--untracked-files=all` expands untracked directories into individual
        // files, so the list is only files — never a folder entry like `dir/`.
        .args([
            "-C",
            &root,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ])
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let files = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| {
            if l.len() < 4 {
                return None;
            }
            let status = l[..2].trim().to_string();
            // Handle "old -> new" for renames by taking the new path.
            let path = l[3..]
                .split(" -> ")
                .last()
                .unwrap_or(&l[3..])
                .trim()
                .to_string();
            Some(ChangedFile { path, status })
        })
        .collect();
    Ok(Json(files))
}

#[derive(Deserialize)]
struct DiffQuery {
    project: String,
    #[serde(default)]
    path: String,
}

/// Unified diff vs HEAD — for one file when `path` is given, else the whole tree.
async fn diff(State(api): State<Api>, Query(q): Query<DiffQuery>) -> Result<String, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    // Full-file context (huge -U) so the user can read the whole file, with the
    // changes highlighted inline — not just the changed hunks.
    let mut args = vec!["-C", &root, "diff", "--unified=100000", "HEAD"];
    if !q.path.is_empty() {
        if q.path.contains("..") {
            return Err(StatusCode::BAD_REQUEST);
        }
        args.push("--");
        args.push(&q.path);
    }
    let out = command("git")
        .args(&args)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

// ---- Interactive terminal (WebSocket ↔ PTY) -------------------------------

#[derive(Deserialize)]
struct TermQuery {
    project: String,
    token: String,
}

#[derive(Deserialize)]
struct ResizeMsg {
    cols: u16,
    rows: u16,
}

/// Get the live PTY for a project, spawning a fresh login shell if there's none
/// (or the previous one exited). The shell is kept alive across reconnects.
fn get_or_create_term(terminals: &Terminals, key: &str, root: &str) -> Option<Arc<TermSession>> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::Read;

    let mut map = terminals.lock().ok()?;
    if let Some(s) = map.get(key) {
        let alive = s
            .child
            .lock()
            .ok()
            .and_then(|mut c| c.try_wait().ok())
            .flatten()
            .is_none();
        if alive {
            return Some(s.clone());
        }
        map.remove(key);
    }

    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 30,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .ok()?;
    let (sh, args) = shell();
    let mut cmd = CommandBuilder::new(sh);
    for a in args {
        cmd.arg(a);
    }
    cmd.cwd(root);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).ok()?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().ok()?;
    let writer = pair.master.take_writer().ok()?;
    let (tx, _) = tokio::sync::broadcast::channel::<Vec<u8>>(1024);
    let session = Arc::new(TermSession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        tx: tx.clone(),
        scrollback: Mutex::new(Vec::new()),
    });

    // One reader thread per PTY: fan output out to the broadcast + a rolling
    // scrollback (replayed on each attach).
    let sess = session.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    if let Ok(mut sb) = sess.scrollback.lock() {
                        sb.extend_from_slice(&chunk);
                        let len = sb.len();
                        if len > 262_144 {
                            sb.drain(0..len - 262_144);
                        }
                    }
                    let _ = sess.tx.send(chunk);
                }
            }
        }
    });

    map.insert(key.to_string(), session.clone());
    Some(session)
}

/// Upgrade to a WebSocket attached to the project's persistent PTY. Output
/// streams to the phone; keystrokes go to the PTY. Disconnecting does NOT kill
/// the shell — a reconnect reattaches and the scrollback is replayed.
async fn term(
    State(api): State<Api>,
    Query(q): Query<TermQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    if q.token != api.token {
        crate::log::warn(
            "anywhere",
            "terminal ws auth rejected",
            serde_json::Value::Null,
        );
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let root = match api.root(&q.project) {
        Some(r) => r,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let session = match get_or_create_term(&api.terminals, &q.project, &root) {
        Some(s) => s,
        None => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    crate::log::info(
        "anywhere",
        "terminal ws connected",
        serde_json::json!({ "project": q.project }),
    );
    ws.on_upgrade(move |socket| term_session(socket, session))
}

async fn term_session(socket: WebSocket, session: Arc<TermSession>) {
    use std::io::Write;

    let mut rx = session.tx.subscribe();
    let (mut ws_tx, mut ws_rx) = socket.split();

    // Reset the client terminal, then replay the current scrollback, so a
    // (re)connect is a clean mirror — no duplication whether the client is fresh
    // (page reload) or retained (background/blip).
    {
        let sb = session
            .scrollback
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        let mut data = b"\x1bc".to_vec();
        data.extend_from_slice(&sb);
        let _ = ws_tx.send(Message::Binary(data)).await;
    }

    let out = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(chunk) => {
                    if ws_tx.send(Message::Binary(chunk)).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    // Binary frames are keystrokes; Text frames are JSON control (resize).
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Binary(b) => {
                if let Ok(mut w) = session.writer.lock() {
                    let _ = w.write_all(&b);
                    let _ = w.flush();
                }
            }
            Message::Text(t) => {
                if let Ok(r) = serde_json::from_str::<ResizeMsg>(&t) {
                    if let Ok(m) = session.master.lock() {
                        let _ = m.resize(portable_pty::PtySize {
                            rows: r.rows,
                            cols: r.cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Keep the PTY alive for reattach; just stop forwarding to this socket.
    out.abort();
    crate::log::info(
        "anywhere",
        "terminal ws disconnected",
        serde_json::Value::Null,
    );
}

async fn comments_get(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<core::Comment>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(core::list_comments(&root)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewCommentBody {
    project: String,
    file: String,
    #[serde(default)]
    start_line: u32,
    #[serde(default)]
    end_line: u32,
    #[serde(rename = "type", default)]
    comment_type: Option<CommentType>,
    #[serde(default)]
    kind: Option<CommentKind>,
    body: String,
}

async fn comments_post(
    State(api): State<Api>,
    Json(b): Json<NewCommentBody>,
) -> Result<Json<core::Comment>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let new = NewComment {
        file: b.file,
        scope: Scope::Range,
        start_line: b.start_line,
        end_line: if b.end_line == 0 {
            b.start_line
        } else {
            b.end_line
        },
        comment_type: b.comment_type.unwrap_or(CommentType::Note),
        kind: b.kind.unwrap_or(CommentKind::Task),
        body: b.body,
        context: Default::default(),
        url: None,
        x: None,
        y: None,
    };
    let created = core::create_comment(&root, new, "phone", None)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(created.comment))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCommentBody {
    project: String,
    id: String,
    #[serde(default)]
    kind: Option<CommentKind>,
    #[serde(default)]
    state: Option<core::CommentState>,
}

/// Change a comment's kind (note ↔ task) and/or state (e.g. resolve) from the phone.
async fn comment_update(
    State(api): State<Api>,
    Json(b): Json<UpdateCommentBody>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    if let Some(kind) = b.kind {
        let patch = core::CommentPatch {
            kind: Some(kind),
            ..Default::default()
        };
        core::update_comment(&root, &b.id, patch).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(state) = b.state {
        core::set_comment_state(&root, &b.id, state)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::OK)
}

/// Emit a desktop event so the focused window dispatches the agent / pre-review.
fn signal(api: &Api, event: &str, root: String) -> StatusCode {
    let _ = api.app.emit(event, root);
    StatusCode::OK
}

async fn run_agent(State(api): State<Api>, Json(q): Json<ProjectQuery>) -> StatusCode {
    match api.root(&q.project) {
        Some(root) => signal(&api, "anywhere://run-agent", root),
        None => StatusCode::NOT_FOUND,
    }
}

async fn prereview(State(api): State<Api>, Json(q): Json<ProjectQuery>) -> StatusCode {
    match api.root(&q.project) {
        Some(root) => signal(&api, "anywhere://prereview", root),
        None => StatusCode::NOT_FOUND,
    }
}

// ---- Guided Pair Review, from the phone -----------------------------------
//
// Reads + disposals (accept/edit/discard/set-file) hit `.reado/sessions/` on disk
// directly via reado-core — no desktop needed; the desktop's watcher reflects
// them. Agent actions (start/review/respond/second-opinion/send) are dispatched
// to the hosting desktop via a `anywhere://review-action` event, since the agent
// runs there.

async fn sessions_get(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<core::Session>>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(core::list_sessions(&root)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposalBody {
    project: String,
    id: String,
    proposal: String,
    #[serde(default)]
    note: bool,
}

async fn session_accept(
    State(api): State<Api>,
    Json(b): Json<ProposalBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let kind = if b.note {
        CommentKind::Note
    } else {
        CommentKind::Task
    };
    core::accept_proposal(&root, &b.id, &b.proposal, kind)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn session_discard(
    State(api): State<Api>,
    Json(b): Json<ProposalBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    core::set_proposal_state(&root, &b.id, &b.proposal, ArtifactState::Discarded, None)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileStateBody {
    project: String,
    id: String,
    file: String,
    state: FileState,
}

async fn session_set_file(
    State(api): State<Api>,
    Json(b): Json<FileStateBody>,
) -> Result<Json<core::Session>, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    core::set_file_state(&root, &b.id, &b.file, b.state)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewActionBody {
    project: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    file: String,
    /// One of: start | file | respond | challenge | send.
    action: String,
    #[serde(default)]
    objective: Option<String>,
}

/// Dispatch an agent action to the hosting desktop (the agent runs there). The
/// desktop window for this project performs it via its guided-review store.
async fn review_action(State(api): State<Api>, Json(b): Json<ReviewActionBody>) -> StatusCode {
    let Some(root) = api.root(&b.project) else {
        return StatusCode::NOT_FOUND;
    };
    let payload = serde_json::json!({
        "root": root,
        "id": b.id,
        "file": b.file,
        "action": b.action,
        "objective": b.objective,
    });
    let _ = api.app.emit("anywhere://review-action", payload);
    StatusCode::OK
}

/// The current resolve-loop state for a paired phone to poll. `{}` when no loop
/// is active. The desktop publishes it via `anywhere_publish_loop`; this
/// capability only carries it (delivery is Anywhere's job).
async fn loop_get(State(api): State<Api>) -> impl axum::response::IntoResponse {
    let body = api
        .loop_state
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_else(|| "{}".to_string());
    ([(header::CONTENT_TYPE, "application/json")], body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_colon_hex() {
        let fp = fingerprint(&[0x00, 0xab, 0xff]);
        assert_eq!(fp.split(':').count(), 32); // SHA-256 → 32 bytes
        assert!(fp.split(':').all(|p| p.len() == 2
            && p.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase())));
    }

    #[test]
    fn tokens_are_unique_hex() {
        let a = mint_token();
        let b = mint_token();
        assert_ne!(a, b);
        assert_eq!(a.len(), 48); // 24 bytes → 48 hex chars
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn safe_join_rejects_traversal() {
        assert!(safe_join("/root", "../etc/passwd").is_none());
        assert!(safe_join("/root", "src/main.rs").is_some());
        assert!(safe_join("/root", "").is_some());
    }

    #[test]
    fn mobile_html_has_exactly_one_inline_script() {
        // The CSP hash targets the single bare <script> (the app). The terminal
        // vendor scripts must stay external (`src=`) so the hash addresses the
        // right block. This guards the assumption `inline_script()` relies on.
        assert_eq!(MOBILE_HTML.matches("<script>").count(), 1);
        assert!(MOBILE_HTML.contains("<script src=\"/vendor/xterm.js\">"));
        // The extracted block is really the app logic, not an empty/wrong slice.
        assert!(inline_script().contains("reado_anywhere_token"));
    }

    #[test]
    fn csp_allows_the_inline_app_script_by_hash() {
        // Regression guard for the empty-shell bug: a strict `script-src 'self'`
        // (no hash) silently blocks the inline app script and the mobile page
        // renders as header-only. The served CSP must carry the script's SHA-256.
        let hash = crate::fs::base64_encode(&Sha256::digest(inline_script().as_bytes()));
        let csp = content_security_policy();
        assert!(
            csp.contains(&format!("script-src 'self' 'sha256-{hash}'")),
            "CSP does not allow the inline script by hash: {csp}"
        );
        // It must NOT fall back to the blunt unsafe-inline for scripts…
        assert!(!csp.contains("script-src 'self' 'unsafe-inline'"));
        // …while the <style> block legitimately keeps style unsafe-inline.
        assert!(csp.contains("style-src 'self' 'unsafe-inline'"));
        // The value is a valid HTTP header value (no control chars, etc.).
        assert!(HeaderValue::from_str(&csp).is_ok());
    }
}
