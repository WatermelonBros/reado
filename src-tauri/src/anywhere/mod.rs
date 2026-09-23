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

mod auth;
mod review;
mod routes;
mod server;
mod term;

use crate::pairing::{self, DeviceInfo, PairingSecret, RateLimiter};
use server::{pairing_url, start_server};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum_server::Handle;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State as TauriState};

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
