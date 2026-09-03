//! Reado Anywhere — the opt-in LAN server.
//!
//! The desktop is the brain; a phone is a thin read/comment client that reaches
//! it over the local network. This module hosts a single TLS server (one per
//! app, shared across windows) that, when the user enables Reado Anywhere, serves
//! a self-contained mobile PWA over HTTPS plus a small JSON API.
//!
//! Auth is per device. The QR carries a **single-use pairing secret**; the phone
//! spends it at `/api/pair` and gets its own long-lived credential, which it
//! then sends as a `Bearer` token. Credentials persist across restarts, expire
//! on their own, and are revocable one at a time — see [`crate::pairing`], which
//! owns the trust model. Failed attempts are rate-limited per peer address.

use crate::pairing::{self, Denied, DeviceInfo, PairingSecret, RateLimiter};
use crate::proc::command;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use axum_server::Handle;
use futures_util::{SinkExt, StreamExt};
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
    /// Single-use pairing secret. The phone spends it at `/api/pair` to mint its
    /// own credential; it is never itself an API credential.
    pub pairing: String,
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

/// A mirror of the desktop's agent terminal, so a phone can watch the agent work
/// on the desk rather than a second shell of its own.
///
/// The desktop publishes here (it already receives the PTY's output as an event);
/// the server only carries it. That keeps one owner for the PTY — duplicating
/// ownership in the server thread is how two readers start stealing each other's
/// bytes.
#[derive(Default, Clone, Serialize)]
pub struct AgentMirror {
    /// Rolling tail of the agent terminal's output, already decoded.
    pub text: String,
    /// Bumped on every publish, so a phone can poll cheaply and skip no-ops.
    pub seq: u64,
    /// The terminal the mirror belongs to; `None` when no agent is running.
    pub terminal: Option<String>,
}

type Agent = Arc<Mutex<AgentMirror>>;

/// Notices the desktop wants paired phones to see (loop lifecycle, agent needs
/// you). A bounded ring: a phone that has been asleep gets the recent ones, not
/// an unbounded backlog.
#[derive(Clone, Serialize)]
pub struct Notice {
    pub id: u64,
    pub kind: String,
    pub text: String,
    pub at: u64,
}

const MAX_NOTICES: usize = 50;

type Notices = Arc<Mutex<Vec<Notice>>>;

/// The paired-device store, shared between the Tauri commands (the device list,
/// revocation) and the server (authentication), so revoking a phone takes effect
/// on the next request rather than at the next restart.
type Devices = Arc<Mutex<pairing::Store>>;

/// The live pairing secret, if the desktop is currently showing a QR.
type Pairing = Arc<Mutex<Option<PairingSecret>>>;

/// Tauri-managed state: the server, the open-project registry, and the recents.
/// `devices` is an Option because the store's path comes from the app handle,
/// which does not exist when this is constructed.
#[derive(Default)]
pub struct AnywhereState {
    running: Mutex<Option<Running>>,
    devices: Mutex<Option<Devices>>,
    pairing: Pairing,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
    agent: Agent,
    notices: Notices,
}

/// The shared state the server needs, cloned out of `AnywhereState` in one go —
/// nine positional arguments is a call nobody can read.
struct Deps {
    devices: Devices,
    pairing: Pairing,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
    agent: Agent,
    notices: Notices,
}

impl AnywhereState {
    /// Everything the server borrows from the managed state.
    fn deps(&self, devices: Devices) -> Deps {
        Deps {
            devices,
            pairing: self.pairing.clone(),
            projects: self.projects.clone(),
            recents: self.recents.clone(),
            terminals: self.terminals.clone(),
            loop_state: self.loop_state.clone(),
            agent: self.agent.clone(),
            notices: self.notices.clone(),
        }
    }
}

/// Shared state handed to the axum handlers.
#[derive(Clone)]
struct Api {
    devices: Devices,
    pairing: Pairing,
    /// Per-address failure tracking for the auth middleware.
    limiter: Arc<Mutex<RateLimiter>>,
    projects: Projects,
    recents: Recents,
    terminals: Terminals,
    loop_state: Loop,
    agent: Agent,
    notices: Notices,
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

/// Where the paired devices and the Anywhere preferences live: the app's own
/// config dir, not the project — a project directory is shared and committed.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("anywhere.json"))
}

/// The paired-device store, loaded from disk on first use. Shared as an `Arc` so
/// the running server and the desktop commands see the same list.
fn devices(app: &AppHandle, state: &AnywhereState) -> Result<Devices, String> {
    let mut guard = state.devices.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let mut store = pairing::Store::load(&config_path(app)?);
        // Drop credentials that would be refused anyway, so the device list
        // never shows a phone that can no longer connect.
        if store.prune() > 0 {
            let _ = store.save();
        }
        *guard = Some(Arc::new(Mutex::new(store)));
    }
    Ok(guard.as_ref().expect("just loaded").clone())
}

/// Run `f` against the store and persist whatever it changed — one funnel, so a
/// mutation cannot forget to save.
fn with_devices<T>(
    app: &AppHandle,
    state: &AnywhereState,
    f: impl FnOnce(&mut pairing::Store) -> T,
) -> Result<T, String> {
    let devices = devices(app, state)?;
    let mut store = devices.lock().map_err(|e| e.to_string())?;
    let out = f(&mut store);
    if let Err(e) = store.save() {
        crate::log::warn(
            "anywhere",
            "could not persist paired devices",
            serde_json::json!({ "error": e.to_string() }),
        );
    }
    Ok(out)
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

/// The full pairing URL a phone can open directly (address + the single-use
/// pairing secret + fingerprint in the fragment). The desktop QR encodes exactly
/// this. The secret is spent on the first pair and expires shortly after.
pub fn pairing_url(info: &AnywhereInfo) -> String {
    format!(
        "{}/#pair={}&fp={}",
        info.url, info.pairing, info.fingerprint
    )
}

/// The address to listen on: the user's chosen interface, else the machine's LAN
/// address. Never `0.0.0.0` — binding every interface is the most open choice
/// available, so it is not the default.
fn bind_address(chosen: Option<&str>) -> Result<IpAddr, String> {
    match chosen {
        Some(addr) => addr
            .parse()
            .map_err(|_| format!("not a valid interface address: {addr}")),
        None => local_ip_address::local_ip().map_err(|e| e.to_string()),
    }
}

/// Build the cert, bind the TLS server, spawn it, and return its handle + info.
/// Shared by the `anywhere_enable` command and the dev autostart.
async fn start_server(app: AppHandle, deps: Deps) -> Result<(Handle, AnywhereInfo), String> {
    let Deps {
        devices,
        pairing: pairing_slot,
        projects,
        recents,
        terminals,
        loop_state,
        agent,
        notices,
    } = deps;
    install_crypto();

    let (bind, mdns_on) = {
        let store = devices.lock().map_err(|e| e.to_string())?;
        (store.config().bind.clone(), store.config().mdns)
    };
    let ip = bind_address(bind.as_deref())?;
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

    // A fresh single-use secret per server start; the desktop can mint another
    // to pair a second device.
    let (secret, clear) = PairingSecret::mint();
    *pairing_slot.lock().map_err(|e| e.to_string())? = Some(secret);

    let info = AnywhereInfo {
        url: format!("https://{ip}:{port}"),
        fingerprint: fp,
        pairing: clear,
    };

    let api = Api {
        devices,
        pairing: pairing_slot,
        limiter: Arc::new(Mutex::new(RateLimiter::default())),
        projects,
        recents,
        terminals,
        loop_state,
        agent,
        notices,
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
        .route("/api/agent-mirror", get(agent_mirror_get))
        .route("/api/agent-input", post(agent_input))
        .route("/api/notices", get(notices_get))
        .route("/api/mark-read", post(mark_read))
        .route("/api/prereview-drafts", get(prereview_drafts))
        .route("/api/prereview-approve", post(prereview_approve))
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
        // The terminal WebSocket validates its credential from the query string
        // (browsers can't set headers on a WS handshake), so it lives outside the
        // bearer-header middleware.
        .route("/api/term", get(term))
        // Pairing is necessarily unauthenticated — it is how a phone gets its
        // credential — but it demands the single-use secret from the QR.
        .route("/api/pair", post(pair))
        .merge(protected)
        .with_state(api);

    let handle = Handle::new();
    let serve_handle = handle.clone();
    let addr = SocketAddr::new(ip, port);
    // Note: the cert fingerprint is intentionally not logged — the `fingerprint`
    // field name is on the redaction denylist, so it would only ever write
    // `<redacted>`. The address is enough to confirm the listener came up.
    crate::log::info(
        "anywhere",
        "server starting",
        serde_json::json!({ "addr": addr.to_string() }),
    );
    tauri::async_runtime::spawn(async move {
        // `with_connect_info` so the auth middleware can see the peer address and
        // rate-limit per source rather than globally.
        let _ = axum_server::bind_rustls(addr, config)
            .handle(serve_handle)
            .serve(router.into_make_service_with_connect_info::<SocketAddr>())
            .await;
    });

    if mdns_on {
        advertise(ip, port);
    }

    Ok((handle, info))
}

/// Advertise the server over mDNS as `_reado._tcp.local.`, so a paired phone can
/// find the desk again without a fresh QR. Off unless the user asks for it, and
/// compiled in only with `--features mdns` — discovery is a convenience, and the
/// dependency should not ride along in builds that never use it.
///
/// The advertisement carries the address only. It is not a credential: a phone
/// that finds the desk this way still authenticates with the credential it got
/// when it paired.
#[cfg(feature = "mdns")]
fn advertise(ip: IpAddr, port: u16) {
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        crate::log::warn(
            "anywhere",
            "mDNS daemon unavailable",
            serde_json::Value::Null,
        );
        return;
    };
    let host = format!("reado-{}", port);
    let service = match mdns_sd::ServiceInfo::new(
        "_reado._tcp.local.",
        &host,
        &format!("{host}.local."),
        ip,
        port,
        None,
    ) {
        Ok(s) => s,
        Err(e) => {
            crate::log::warn(
                "anywhere",
                "mDNS service could not be described",
                serde_json::json!({ "error": e.to_string() }),
            );
            return;
        }
    };
    if let Err(e) = daemon.register(service) {
        crate::log::warn(
            "anywhere",
            "mDNS registration failed",
            serde_json::json!({ "error": e.to_string() }),
        );
        return;
    }
    // The daemon stops advertising when it drops, and the advertisement should
    // outlive this call, so it is deliberately leaked for the process lifetime.
    std::mem::forget(daemon);
    crate::log::info("anywhere", "advertising over mDNS", serde_json::Value::Null);
}

/// Without the `mdns` feature the toggle is inert: the setting persists, and a
/// build that includes the feature honours it.
#[cfg(not(feature = "mdns"))]
fn advertise(_ip: IpAddr, _port: u16) {
    crate::log::info(
        "anywhere",
        "mDNS requested but this build has no mdns feature",
        serde_json::Value::Null,
    );
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
    let devices = devices(&app, &state)?;
    let deps = state.deps(devices);
    let (handle, info) = start_server(app, deps).await?;
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
    let devices = match devices(app, &state) {
        Ok(d) => d,
        Err(e) => {
            crate::log::error(
                "anywhere",
                "dev autostart could not load devices",
                serde_json::json!({ "error": e }),
            );
            return;
        }
    };
    let deps = state.deps(devices);
    let projects = deps.projects.clone();
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
    match tauri::async_runtime::block_on(start_server(app.clone(), deps)) {
        Ok((handle, info)) => {
            crate::log::info(
                "anywhere",
                "dev autostart up",
                serde_json::json!({ "url": info.url }),
            );
            // Intentional dev-only stdout (gated by READO_ANYWHERE_AUTOSTART): the
            // pairing URL carries the single-use pairing secret, so it is printed
            // for the developer's terminal but never written to the (shareable)
            // log file.
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

/// Mirror the agent terminal's output for paired phones.
///
/// The desktop publishes because it already receives the PTY's output as an
/// event and owns the session; a second reader in the server thread would race
/// it for the same bytes. `text` is a rolling tail, not the whole scrollback.
#[tauri::command]
pub fn anywhere_publish_agent(
    state: TauriState<'_, AnywhereState>,
    terminal: Option<String>,
    text: String,
) {
    if let Ok(mut mirror) = state.agent.lock() {
        mirror.seq = mirror.seq.wrapping_add(1);
        mirror.terminal = terminal;
        mirror.text = text;
    }
}

/// Push a notice to paired phones (loop finished, the agent is waiting on you).
/// Bounded so a long session can't grow the ring without limit.
#[tauri::command]
pub fn anywhere_notify(state: TauriState<'_, AnywhereState>, kind: String, text: String) {
    if let Ok(mut notices) = state.notices.lock() {
        let id = notices.last().map(|n| n.id + 1).unwrap_or(1);
        notices.push(Notice {
            id,
            kind,
            text,
            at: chrono::Utc::now().timestamp_millis() as u64,
        });
        let overflow = notices.len().saturating_sub(MAX_NOTICES);
        if overflow > 0 {
            notices.drain(0..overflow);
        }
    }
}

// ---- Device management (desktop side) --------------------------------------

/// The paired devices, newest first. Credential hashes never cross this
/// boundary — see `pairing::DeviceInfo`.
#[tauri::command]
pub fn anywhere_devices(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
) -> Result<Vec<DeviceInfo>, String> {
    with_devices(&app, &state, |store| {
        let mut list = store.devices();
        list.sort_by_key(|d| std::cmp::Reverse(d.created));
        list
    })
}

/// Revoke one device. The next request it makes is refused — the store is shared
/// with the running server, so this does not wait for a restart.
#[tauri::command]
pub fn anywhere_revoke(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
    id: String,
) -> Result<bool, String> {
    let removed = with_devices(&app, &state, |store| store.revoke(&id))?;
    if removed {
        crate::log::info("anywhere", "device revoked", serde_json::Value::Null);
    }
    Ok(removed)
}

/// Revoke every paired device. Returns how many were dropped.
#[tauri::command]
pub fn anywhere_revoke_all(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
) -> Result<usize, String> {
    let count = with_devices(&app, &state, |store| store.revoke_all())?;
    if count > 0 {
        crate::log::info(
            "anywhere",
            "all devices revoked",
            serde_json::json!({ "count": count }),
        );
    }
    Ok(count)
}

/// Mint a fresh single-use pairing secret and return the QR payload, so a second
/// phone can pair without disturbing the first.
#[tauri::command]
pub fn anywhere_new_pairing(state: TauriState<'_, AnywhereState>) -> Result<AnywhereInfo, String> {
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    let Some(r) = running.as_mut() else {
        return Err("Reado Anywhere is not running".into());
    };
    let (secret, clear) = PairingSecret::mint();
    *state.pairing.lock().map_err(|e| e.to_string())? = Some(secret);
    r.info.pairing = clear;
    Ok(r.info.clone())
}

/// How long a credential lives: idle days, then absolute days. 0 turns a check
/// off. Takes effect on the next request.
#[tauri::command]
pub fn anywhere_set_lifetimes(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
    idle_days: i64,
    max_days: i64,
) -> Result<(), String> {
    with_devices(&app, &state, |store| {
        store.set_lifetimes(idle_days, max_days)
    })
}

/// The Anywhere preferences the dialog renders (lifetimes, interface, mDNS).
#[tauri::command]
pub fn anywhere_config(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
) -> Result<pairing::Config, String> {
    // Clone without the device list: the dialog reads devices through
    // `anywhere_devices`, and this keeps credential hashes out of the payload.
    with_devices(&app, &state, |store| pairing::Config {
        devices: Vec::new(),
        ..store.config().clone()
    })
}

/// A bindable network interface, as the dialog lists them.
#[derive(Serialize)]
pub struct Iface {
    pub name: String,
    pub addr: String,
}

/// The machine's IPv4 interfaces. Loopback is included but listed last: binding
/// there makes Anywhere reachable only from this machine, which is a legitimate
/// (if quiet) choice.
#[tauri::command]
pub fn anywhere_interfaces() -> Result<Vec<Iface>, String> {
    let mut list: Vec<Iface> = local_ip_address::list_afinet_netifas()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, addr)| addr.is_ipv4())
        .map(|(name, addr)| Iface {
            name,
            addr: addr.to_string(),
        })
        .collect();
    list.sort_by_key(|i| (i.addr.starts_with("127."), i.addr.clone()));
    list.dedup_by(|a, b| a.addr == b.addr);
    Ok(list)
}

/// Choose the interface to bind (`None` = the machine's LAN address). Applies at
/// the next enable, since the listener is already bound.
#[tauri::command]
pub fn anywhere_set_bind(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
    bind: Option<String>,
) -> Result<(), String> {
    with_devices(&app, &state, |store| store.set_bind(bind))
}

/// Turn mDNS advertisement on or off. Applies at the next enable.
#[tauri::command]
pub fn anywhere_set_mdns(
    app: AppHandle,
    state: TauriState<'_, AnywhereState>,
    on: bool,
) -> Result<(), String> {
    with_devices(&app, &state, |store| store.set_mdns(on))
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

// ---- Auth ------------------------------------------------------------------

/// The credential check, minus the `Api` it hangs off — an `AppHandle` can't be
/// built in a test, and the *order* here is the security property: a locked-out
/// peer is refused before the secret is looked at, so a lockout can't be probed.
fn authenticate_with(
    devices: &Devices,
    limiter: &Arc<Mutex<RateLimiter>>,
    secret: &str,
    peer: IpAddr,
) -> Result<String, Denied> {
    {
        let l = limiter.lock().map_err(|_| Denied::RateLimited)?;
        if !l.allowed(peer) {
            return Err(Denied::RateLimited);
        }
    }
    let mut store = devices.lock().map_err(|_| Denied::Unknown)?;
    match store.verify(secret) {
        Ok(id) => {
            // Persist the touched `last_seen` so an idle timeout measures real
            // use rather than time since the app started.
            let _ = store.save();
            if let Ok(mut l) = limiter.lock() {
                l.succeed(peer);
            }
            Ok(id)
        }
        Err(denied) => {
            if let Ok(mut l) = limiter.lock() {
                l.fail(peer);
            }
            Err(denied)
        }
    }
}

impl Api {
    /// Check a device credential, moving the device's `last_seen` on success and
    /// counting the failure against the peer on refusal. The caller turns any
    /// `Denied` into the same 401 — telling a client *why* it was refused would
    /// be an oracle for probing which credentials exist.
    fn authenticate(&self, secret: &str, peer: IpAddr) -> Result<String, Denied> {
        authenticate_with(&self.devices, &self.limiter, secret, peer)
    }
}

// A poisoned lock is not a credential problem, but it must not fail *open*.
impl From<std::sync::PoisonError<std::sync::MutexGuard<'_, RateLimiter>>> for Denied {
    fn from(_: std::sync::PoisonError<std::sync::MutexGuard<'_, RateLimiter>>) -> Self {
        Denied::RateLimited
    }
}

/// Gate `/api/*` on a device credential presented as `Authorization: Bearer …`.
async fn auth(
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    let presented = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    match api.authenticate(presented, peer.ip()) {
        Ok(_) => next.run(req).await,
        Err(denied) => {
            crate::log::warn(
                "anywhere",
                "client auth rejected",
                serde_json::json!({ "path": req.uri().path(), "reason": format!("{denied:?}") }),
            );
            // A throttled caller is told so; everything else is a flat 401.
            if denied == Denied::RateLimited {
                StatusCode::TOO_MANY_REQUESTS.into_response()
            } else {
                StatusCode::UNAUTHORIZED.into_response()
            }
        }
    }
}

/// What a phone sends to redeem the QR's single-use secret.
#[derive(Deserialize)]
struct PairBody {
    secret: String,
    /// A name the phone proposes for itself; sanitized before it is stored.
    #[serde(default)]
    name: String,
}

/// The credential a freshly paired phone stores and sends from then on.
#[derive(Serialize)]
struct PairedBody {
    token: String,
}

/// Redeem the pairing secret from the QR for a device credential of the phone's
/// own. The secret is single-use and short-lived, so a photographed QR stops
/// being useful once a phone has spent it.
async fn pair(
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(body): Json<PairBody>,
) -> Response {
    let peer = peer.ip();
    // Pairing is unauthenticated by nature, so it is rate-limited like auth —
    // otherwise it would be the one endpoint free to guess against.
    {
        let Ok(limiter) = api.limiter.lock() else {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        };
        if !limiter.allowed(peer) {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
    }

    let Ok(mut slot) = api.pairing.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let accepted = slot.as_ref().map(|p| p.accepts(&body.secret)) == Some(true);
    if !accepted {
        if let Ok(mut limiter) = api.limiter.lock() {
            limiter.fail(peer);
        }
        crate::log::warn("anywhere", "pairing rejected", serde_json::Value::Null);
        return StatusCode::UNAUTHORIZED.into_response();
    }
    // Spend it: one QR, one device.
    *slot = None;
    drop(slot);

    let Ok(mut store) = api.devices.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let token = store.pair(&body.name);
    if let Err(e) = store.save() {
        crate::log::warn(
            "anywhere",
            "paired device could not be persisted",
            serde_json::json!({ "error": e.to_string() }),
        );
    }
    if let Ok(mut limiter) = api.limiter.lock() {
        limiter.succeed(peer);
    }
    crate::log::info("anywhere", "device paired", serde_json::Value::Null);
    let _ = api.app.emit("anywhere-devices-changed", ());
    Json(PairedBody { token }).into_response()
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
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Query(q): Query<TermQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    // Same credential check as the bearer middleware, including the rate limit —
    // the WebSocket is not a softer door because the token rides in the query.
    if let Err(denied) = api.authenticate(&q.token, peer.ip()) {
        crate::log::warn(
            "anywhere",
            "terminal ws auth rejected",
            serde_json::json!({ "reason": format!("{denied:?}") }),
        );
        return if denied == Denied::RateLimited {
            StatusCode::TOO_MANY_REQUESTS.into_response()
        } else {
            StatusCode::UNAUTHORIZED.into_response()
        };
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

/// The agent terminal's mirrored output. The phone polls this with the `seq` it
/// last saw; an unchanged `seq` means nothing new to draw.
async fn agent_mirror_get(State(api): State<Api>) -> Json<AgentMirror> {
    Json(
        api.agent
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| AgentMirror::default()),
    )
}

#[derive(Deserialize)]
struct AgentInput {
    data: String,
}

/// Keystrokes from the phone, forwarded to the desktop's agent terminal. The
/// desktop owns the PTY and does the write; this only carries the bytes, which
/// is what keeps a single writer on that terminal.
async fn agent_input(State(api): State<Api>, Json(b): Json<AgentInput>) -> StatusCode {
    let _ = api.app.emit("anywhere://agent-input", b.data);
    StatusCode::OK
}

/// Recent notices for a paired phone. Bounded, so a phone that has been asleep
/// for an hour gets the tail rather than an unbounded backlog.
async fn notices_get(State(api): State<Api>) -> Json<Vec<Notice>> {
    Json(api.notices.lock().map(|n| n.clone()).unwrap_or_default())
}

#[derive(Deserialize)]
struct MarkReadBody {
    project: String,
    file: String,
    #[serde(default)]
    read: bool,
}

/// Mark a file read (or unread) from the phone. Reading progress lives in
/// `.reado/`, so this writes the same store the desktop does.
async fn mark_read(
    State(api): State<Api>,
    Json(b): Json<MarkReadBody>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    // No content snapshot from the phone: the read-delta baseline should be the
    // bytes the reader actually saw, and the phone renders its own rendition.
    crate::progress::set_read(root, b.file, b.read, None)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

/// The AI pre-review's draft comments, so the phone can curate them. The store is
/// the same `.reado/pre-review.json` the desktop panel reads.
async fn prereview_drafts(
    State(api): State<Api>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let root = api.root(&q.project).ok_or(StatusCode::NOT_FOUND)?;
    let path = Path::new(&root).join(".reado").join("pre-review.json");
    let text = std::fs::read_to_string(path).unwrap_or_else(|_| "[]".into());
    Ok(Json(
        serde_json::from_str(&text).unwrap_or(serde_json::Value::Array(vec![])),
    ))
}

#[derive(Deserialize)]
struct DraftDecision {
    project: String,
    id: String,
    /// True to turn the draft into a real anchored comment, false to discard it.
    approve: bool,
}

/// Approve or discard one pre-review draft. Approving materialises a real
/// anchored task comment — the same thing the desktop's Approve button does —
/// and either way the draft leaves the store.
async fn prereview_approve(
    State(api): State<Api>,
    Json(b): Json<DraftDecision>,
) -> Result<StatusCode, StatusCode> {
    let root = api.root(&b.project).ok_or(StatusCode::NOT_FOUND)?;
    let path = Path::new(&root).join(".reado").join("pre-review.json");
    let text = std::fs::read_to_string(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let drafts: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();

    let Some(draft) = drafts
        .iter()
        .find(|d| d.get("id").and_then(|v| v.as_str()) == Some(b.id.as_str()))
    else {
        return Err(StatusCode::NOT_FOUND);
    };

    if b.approve {
        let file = draft
            .get("file")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let line = draft.get("line").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
        let body = draft
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let comment_type = draft
            .get("type")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or(CommentType::Note);
        core::create_comment(
            &root,
            NewComment {
                file,
                scope: Scope::Range,
                start_line: line.max(1),
                end_line: line.max(1),
                comment_type,
                kind: CommentKind::Task,
                body,
                context: core::Context::default(),
                url: None,
                x: None,
                y: None,
            },
            "human",
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let remaining: Vec<_> = drafts
        .into_iter()
        .filter(|d| d.get("id").and_then(|v| v.as_str()) != Some(b.id.as_str()))
        .collect();
    let out = serde_json::to_string_pretty(&remaining).unwrap_or_else(|_| "[]".into());
    std::fs::write(&path, out).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
    fn a_locked_out_peer_is_refused_before_the_secret_is_checked() {
        // `pairing::tests` proves the limiter's arithmetic six ways over. This
        // proves it is *consulted*: the gate can be deleted from the auth path
        // with every one of those tests still green.
        let dir = tempfile::tempdir().unwrap();
        let devices: Devices = Arc::new(Mutex::new(pairing::Store::load(
            &dir.path().join("anywhere.json"),
        )));
        let secret = devices.lock().unwrap().pair("phone");
        let limiter: Arc<Mutex<RateLimiter>> = Arc::new(Mutex::new(RateLimiter::default()));
        let peer: IpAddr = "192.168.1.50".parse().unwrap();

        // The right secret works to begin with.
        assert!(authenticate_with(&devices, &limiter, &secret, peer).is_ok());

        // Guess past the grace period.
        for _ in 0..10 {
            let _ = authenticate_with(&devices, &limiter, "wrong", peer);
        }

        // Now even the correct secret is refused, and refused as rate-limited
        // rather than unknown — the lockout is reached before `verify`.
        assert_eq!(
            authenticate_with(&devices, &limiter, &secret, peer),
            Err(Denied::RateLimited)
        );
    }

    #[test]
    fn fingerprint_is_colon_hex() {
        let fp = fingerprint(&[0x00, 0xab, 0xff]);
        assert_eq!(fp.split(':').count(), 32); // SHA-256 → 32 bytes
        assert!(fp.split(':').all(|p| p.len() == 2
            && p.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase())));
    }

    fn info() -> AnywhereInfo {
        AnywhereInfo {
            url: "https://192.168.1.10:4443".into(),
            fingerprint: "AA:BB".into(),
            pairing: "s3cr3t".into(),
        }
    }

    #[test]
    fn the_qr_carries_a_pairing_secret_not_a_credential() {
        let url = pairing_url(&info());
        assert!(url.contains("#pair=s3cr3t"));
        // The old shape handed out a long-lived API token in the fragment; a
        // scan must never again be a credential by itself.
        assert!(!url.contains("token="));
    }

    #[test]
    fn the_qr_puts_its_secrets_in_the_fragment() {
        // A fragment is not sent to the server and does not land in logs or
        // Referer headers the way a query string would.
        let url = pairing_url(&info());
        let (_, fragment) = url.split_once('#').expect("a fragment");
        assert!(fragment.contains("s3cr3t"));
        assert!(!url[..url.find('#').unwrap()].contains("s3cr3t"));
    }

    #[test]
    fn a_chosen_interface_is_bound_verbatim() {
        assert_eq!(
            bind_address(Some("192.168.1.10")).unwrap().to_string(),
            "192.168.1.10"
        );
    }

    #[test]
    fn a_bogus_interface_is_refused_rather_than_falling_back() {
        // Falling back to the LAN address would silently bind wider than the
        // user asked for — the whole point of choosing an interface.
        assert!(bind_address(Some("not-an-address")).is_err());
        assert!(bind_address(Some("0.0.0.0.0")).is_err());
    }

    #[test]
    fn the_default_bind_is_never_all_interfaces() {
        // `local_ip()` can legitimately fail on a machine with no network; what
        // must never happen is a silent 0.0.0.0.
        if let Ok(addr) = bind_address(None) {
            assert_ne!(addr.to_string(), "0.0.0.0");
        }
    }

    #[test]
    fn the_notice_ring_keeps_the_most_recent() {
        // A phone asleep for an hour should get the tail, not an unbounded
        // backlog, and the ids must stay monotonic across the eviction.
        let mut notices: Vec<Notice> = Vec::new();
        for i in 0..(MAX_NOTICES + 10) {
            let id = notices.last().map(|n: &Notice| n.id + 1).unwrap_or(1);
            notices.push(Notice {
                id,
                kind: "test".into(),
                text: format!("n{i}"),
                at: 0,
            });
            let overflow = notices.len().saturating_sub(MAX_NOTICES);
            if overflow > 0 {
                notices.drain(0..overflow);
            }
        }
        assert_eq!(notices.len(), MAX_NOTICES);
        assert_eq!(
            notices.last().unwrap().text,
            format!("n{}", MAX_NOTICES + 9)
        );
        assert!(notices.windows(2).all(|w| w[1].id == w[0].id + 1));
    }

    #[test]
    fn an_unpublished_agent_mirror_reads_as_no_agent() {
        // `terminal: None` is what the phone renders as "nothing running", so
        // the default must not look like an agent with an empty screen.
        let mirror = AgentMirror::default();
        assert!(mirror.terminal.is_none());
        assert_eq!(mirror.seq, 0);
        assert!(mirror.text.is_empty());
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
