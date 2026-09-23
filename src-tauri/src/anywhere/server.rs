//! The TLS server itself: certificate, bind address, the router, mDNS.

use super::auth::{auth, pair};
use super::review::*;
use super::routes::*;
use super::term::term;
use super::{AnywhereInfo, Api, Deps};
use crate::pairing::{PairingSecret, RateLimiter};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex, Once};

use axum::http::{header, HeaderValue};
use axum::middleware;
use axum::response::Html;
use axum::routing::{get, post};
use axum::Router;
use axum_server::tls_rustls::RustlsConfig;
use axum_server::Handle;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

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

// ---- The mobile client (a self-contained PWA, served at `/`) ---------------

const MOBILE_HTML: &str = include_str!("../anywhere_mobile.html");
const MANIFEST: &str = r##"{"name":"Reado Anywhere","short_name":"Reado","display":"standalone","background_color":"#1b1f28","theme_color":"#1b1f28","icons":[]}"##;

// xterm.js (+ fit addon + css), vendored into the repo so the phone gets a real
// terminal emulator over the LAN with no internet — and so the build doesn't
// depend on node_modules being present (the Rust CI job doesn't install it).
const XTERM_JS: &str = include_str!("../vendor/xterm.js");
const XTERM_CSS: &str = include_str!("../vendor/xterm.css");
const XTERM_FIT: &str = include_str!("../vendor/addon-fit.js");

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
pub(super) async fn start_server(
    app: AppHandle,
    deps: Deps,
) -> Result<(Handle, AnywhereInfo), String> {
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

    let (config, fp) = tls_config(ip).await?;

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

    let router = router(api);

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

/// A self-signed certificate for `ip` (and `localhost`), as the rustls config to
/// serve with plus its fingerprint for the QR.
async fn tls_config(ip: IpAddr) -> Result<(RustlsConfig, String), String> {
    let cert = rcgen::generate_simple_self_signed(vec![ip.to_string(), "localhost".into()])
        .map_err(|e| e.to_string())?;
    let fp = fingerprint(cert.cert.der());
    let config = RustlsConfig::from_pem(
        cert.cert.pem().into_bytes(),
        cert.key_pair.serialize_pem().into_bytes(),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok((config, fp))
}

/// Every route the server answers: the page and its vendored assets, the two
/// endpoints that authenticate themselves (terminal, pairing), and the bearer-
/// gated JSON API.
fn router(api: Api) -> Router {
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
    Router::new()
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
        .with_state(api)
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
