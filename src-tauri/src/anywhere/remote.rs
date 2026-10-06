//! Reaching the Anywhere server from outside the local network.
//!
//! The core does not know how the bytes get here — in the official build a relay
//! forwards a phone's TLS connection, still encrypted, and the embedding code hands
//! it over with [`serve`]. What the core owns is what changes once a connection
//! did not come through its own LAN listener:
//!
//! - **A certificate for the public hostname.** The listener's TLS picks a
//!   certificate by SNI: the self-signed one for the LAN address, the embedder's
//!   (see [`set_remote`]) for its hostname. TLS still ends here, so whatever
//!   carried the bytes saw only ciphertext.
//! - **Pairing needs the desktop.** A QR is good for five minutes; on the
//!   internet a photographed one must not be enough. A pairing that arrives
//!   remotely shows a code on the phone and on the desktop, and only Allow here
//!   mints the credential.
//! - **The phone's own shell is off** unless the user turned it on for remote
//!   connections (`remote_terminal`).
//! - **The desktop shows who is connected** (`anywhere-remote-activity`).

use super::{AnywhereState, Api};
use crate::pairing::{mint_secret, sanitize_name};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use axum::extract::ConnectInfo;
use axum::Extension;
use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::server::{ClientHello, ResolvesServerCert};
use rustls::sign::CertifiedKey;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::Notify;

/// Marks a request that came through [`serve`] rather than the LAN listener.
#[derive(Clone, Copy)]
pub(super) struct Remote;

/// The embedder's certificate, by the hostname it was issued for. Global because
/// it outlives any one server start: set once the build has it, read at every
/// handshake.
static REMOTE: RwLock<Option<(String, Arc<CertifiedKey>)>> = RwLock::new(None);

/// The public hostname the server answers for, when one is set.
pub fn remote_host() -> Option<String> {
    REMOTE.read().ok()?.as_ref().map(|(h, _)| h.clone())
}

/// Serve `host` with this certificate chain and key (PEM), or stop with `None`.
/// Takes effect on the next handshake, running server or not.
pub fn set_remote(app: &AppHandle, remote: Option<(String, String, String)>) -> Result<(), String> {
    let value = match remote {
        None => None,
        Some((host, cert_pem, key_pem)) => {
            Some((host.to_ascii_lowercase(), certified(&cert_pem, &key_pem)?))
        }
    };
    *REMOTE.write().map_err(|e| e.to_string())? = value;
    let _ = app.emit("anywhere-remote-changed", ());
    Ok(())
}

/// A rustls signing key and chain from PEM.
pub(super) fn certified(cert_pem: &str, key_pem: &str) -> Result<Arc<CertifiedKey>, String> {
    let chain = CertificateDer::pem_slice_iter(cert_pem.as_bytes())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("certificate: {e}"))?;
    if chain.is_empty() {
        return Err("certificate: no PEM certificate".into());
    }
    let key = PrivateKeyDer::from_pem_slice(key_pem.as_bytes()).map_err(|e| format!("key: {e}"))?;
    let key =
        rustls::crypto::ring::sign::any_supported_type(&key).map_err(|e| format!("key: {e}"))?;
    Ok(Arc::new(CertifiedKey::new(chain, key)))
}

/// Picks the certificate by SNI: the embedder's for its hostname, the LAN one for
/// everything else (an IP address carries no SNI at all).
#[derive(Debug)]
pub(super) struct Resolver {
    pub lan: Arc<CertifiedKey>,
}

impl ResolvesServerCert for Resolver {
    fn resolve(&self, hello: ClientHello<'_>) -> Option<Arc<CertifiedKey>> {
        let asked = hello.server_name().map(str::to_ascii_lowercase);
        if let (Some(name), Ok(remote)) = (asked, REMOTE.read()) {
            if let Some((host, key)) = remote.as_ref() {
                if *host == name {
                    return Some(key.clone());
                }
            }
        }
        Some(self.lan.clone())
    }
}

/// Serve one connection that reached the desktop some other way than the LAN
/// listener — still TLS-encrypted, as the phone sent it. `peer` is the phone's
/// address, so rate limiting keeps meaning the phone. Returns when the
/// connection closes; fails at once when Anywhere is off.
pub async fn serve<IO>(app: &AppHandle, io: IO, peer: SocketAddr) -> Result<(), String>
where
    IO: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (tls, router) = {
        let state = app.state::<AnywhereState>();
        let running = state.running.lock().map_err(|e| e.to_string())?;
        let r = running.as_ref().ok_or("Reado Anywhere is not running")?;
        (r.tls.clone(), r.router.clone())
    };
    serve_stream(tls, router, io, peer).await
}

/// [`serve`] once the server's TLS and routes are in hand.
async fn serve_stream<IO>(
    tls: Arc<rustls::ServerConfig>,
    router: axum::Router,
    io: IO,
    peer: SocketAddr,
) -> Result<(), String>
where
    IO: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    use hyper_util::rt::{TokioExecutor, TokioIo};
    use tower::ServiceExt;

    let stream = tokio_rustls::TlsAcceptor::from(tls)
        .accept(io)
        .await
        .map_err(|e| format!("TLS: {e}"))?;
    let router = router
        .layer(Extension(ConnectInfo(peer)))
        .layer(Extension(Remote));
    let service = hyper::service::service_fn(move |req: hyper::Request<hyper::body::Incoming>| {
        router.clone().oneshot(req.map(axum::body::Body::new))
    });
    hyper_util::server::conn::auto::Builder::new(TokioExecutor::new())
        .serve_connection_with_upgrades(TokioIo::new(stream), service)
        .await
        .map_err(|e| e.to_string())
}

/// Whether the Anywhere server is up — a remote connection has nowhere to go
/// otherwise.
pub fn is_running(app: &AppHandle) -> bool {
    let state = app.state::<AnywhereState>();
    let running = state.running.lock().map(|r| r.is_some()).unwrap_or(false);
    running
}

/// Revoke every device that paired remotely (the remote kill switch). Devices
/// paired on the LAN stay. Returns how many were dropped.
pub fn revoke_remote(app: &AppHandle) -> Result<usize, String> {
    let state = app.state::<AnywhereState>();
    let count = super::with_devices(app, &state, |store| store.revoke_remote())?;
    let _ = app.emit("anywhere-devices-changed", ());
    Ok(count)
}

// ---- Pairing that waits for the desktop -------------------------------------

/// How long a remote pairing waits for Allow before the phone must scan again.
const CONFIRM_TTL: Duration = Duration::from_secs(120);
/// How long one `/api/pair-wait` holds before answering "still waiting".
const WAIT_POLL: Duration = Duration::from_secs(25);

/// A remote pairing waiting for the desktop's answer.
pub(super) struct Pending {
    name: String,
    code: String,
    created: Instant,
    /// `Some` once the desktop answered: the credential, or `None` for Deny.
    answer: Option<Option<String>>,
    notify: Arc<Notify>,
}

pub(super) type Confirms = Arc<Mutex<HashMap<String, Pending>>>;

/// What the desktop is asked, and the phone shows meanwhile.
#[derive(Clone, Serialize)]
pub(super) struct PairRequest {
    pub id: String,
    pub name: String,
    pub code: String,
}

/// Six digits, the same on both screens.
fn code() -> String {
    let n = u32::from_str_radix(&mint_secret()[..8], 16).unwrap_or(0) % 1_000_000;
    format!("{n:06}")
}

impl Api {
    /// Hold a remote pairing until the desktop answers; tells the desktop.
    pub(super) fn request_pair(&self, name: &str) -> PairRequest {
        let req = PairRequest {
            id: mint_secret(),
            name: sanitize_name(name),
            code: code(),
        };
        if let Ok(mut map) = self.confirms.lock() {
            map.retain(|_, p| p.created.elapsed() < CONFIRM_TTL);
            map.insert(
                req.id.clone(),
                Pending {
                    name: req.name.clone(),
                    code: req.code.clone(),
                    created: Instant::now(),
                    answer: None,
                    notify: Arc::new(Notify::new()),
                },
            );
        }
        let _ = self.app.emit("anywhere-pair-request", req.clone());
        req
    }

    /// The desktop's answer for `id`, waiting a while for it: `Ok(Some(token))`
    /// on Allow, `Ok(None)` while still undecided, `Err` when denied or gone.
    pub(super) async fn wait_pair(&self, id: &str) -> Result<Option<String>, WaitEnd> {
        let notify = {
            let map = self.confirms.lock().map_err(|_| WaitEnd::Gone)?;
            map.get(id).ok_or(WaitEnd::Gone)?.notify.clone()
        };
        let _ = tokio::time::timeout(WAIT_POLL, notify.notified()).await;
        let mut map = self.confirms.lock().map_err(|_| WaitEnd::Gone)?;
        let pending = map.get(id).ok_or(WaitEnd::Gone)?;
        match &pending.answer {
            Some(Some(token)) => {
                let token = token.clone();
                map.remove(id);
                Ok(Some(token))
            }
            Some(None) => {
                map.remove(id);
                Err(WaitEnd::Denied)
            }
            None if pending.created.elapsed() >= CONFIRM_TTL => {
                map.remove(id);
                Err(WaitEnd::Gone)
            }
            None => Ok(None),
        }
    }

    /// The code shown for a pending pairing, for the phone's "still waiting".
    pub(super) fn pending_code(&self, id: &str) -> Option<String> {
        self.confirms.lock().ok()?.get(id).map(|p| p.code.clone())
    }

    /// Note that a remote device is using the desk, at most every few seconds.
    pub(super) fn remote_seen(&self, device: &str) {
        const EVERY: Duration = Duration::from_secs(10);
        let Ok(mut seen) = self.seen.lock() else {
            return;
        };
        if seen.get(device).is_some_and(|t| t.elapsed() < EVERY) {
            return;
        }
        seen.insert(device.to_string(), Instant::now());
        drop(seen);
        let name = self.devices.lock().ok().and_then(|s| s.name_of(device));
        let _ = self.app.emit(
            "anywhere-remote-activity",
            serde_json::json!({ "id": device, "name": name }),
        );
    }
}

/// Why a remote pairing stopped waiting.
#[derive(Debug, PartialEq)]
pub(super) enum WaitEnd {
    Denied,
    /// Unknown, expired, or already collected.
    Gone,
}

/// The desktop's Allow or Deny for a remote pairing. Allow mints the device's
/// credential, marked remote; the phone collects it at `/api/pair-wait`.
pub(super) fn answer(
    app: &AppHandle,
    state: &AnywhereState,
    id: &str,
    allow: bool,
) -> Result<bool, String> {
    let name = {
        let map = state.confirms.lock().map_err(|e| e.to_string())?;
        match map.get(id) {
            Some(p) if p.answer.is_none() && p.created.elapsed() < CONFIRM_TTL => p.name.clone(),
            _ => return Ok(false),
        }
    };
    let token = if allow {
        Some(super::with_devices(app, state, |store| {
            store.pair_remote(&name)
        })?)
    } else {
        None
    };
    let mut map = state.confirms.lock().map_err(|e| e.to_string())?;
    let Some(p) = map.get_mut(id) else {
        return Ok(false);
    };
    p.answer = Some(token);
    p.notify.notify_one();
    drop(map);
    if allow {
        crate::log::info("anywhere", "remote device paired", serde_json::Value::Null);
        let _ = app.emit("anywhere-devices-changed", ());
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_code_is_six_digits() {
        for _ in 0..50 {
            let c = code();
            assert_eq!(c.len(), 6);
            assert!(c.chars().all(|ch| ch.is_ascii_digit()));
        }
    }

    /// A TLS client over an in-memory stream to `serve_stream`, asking for
    /// `name`; returns the certificate it was shown and the response body.
    async fn fetch(name: &str, lan: Arc<CertifiedKey>) -> (Vec<u8>, String) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let _ = rustls::crypto::ring::default_provider().install_default();
        let mut config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_cert_resolver(Arc::new(Resolver { lan }));
        config.alpn_protocols = vec![b"http/1.1".to_vec()];
        let router =
            axum::Router::new().route(
                "/who",
                axum::routing::get(
                    |ConnectInfo(peer): ConnectInfo<SocketAddr>,
                     remote: Option<Extension<Remote>>| async move {
                        format!("{peer} remote={}", remote.is_some())
                    },
                ),
            );
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let peer: SocketAddr = "203.0.113.7:5544".parse().unwrap();
        tokio::spawn(serve_stream(Arc::new(config), router, server_io, peer));

        #[derive(Debug)]
        struct AnyCert;
        impl rustls::client::danger::ServerCertVerifier for AnyCert {
            fn verify_server_cert(
                &self,
                _: &CertificateDer<'_>,
                _: &[CertificateDer<'_>],
                _: &rustls::pki_types::ServerName<'_>,
                _: &[u8],
                _: rustls::pki_types::UnixTime,
            ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
                Ok(rustls::client::danger::ServerCertVerified::assertion())
            }
            fn verify_tls12_signature(
                &self,
                _: &[u8],
                _: &CertificateDer<'_>,
                _: &rustls::DigitallySignedStruct,
            ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error>
            {
                Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
            }
            fn verify_tls13_signature(
                &self,
                _: &[u8],
                _: &CertificateDer<'_>,
                _: &rustls::DigitallySignedStruct,
            ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error>
            {
                Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
            }
            fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
                rustls::crypto::ring::default_provider()
                    .signature_verification_algorithms
                    .supported_schemes()
            }
        }
        let client = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AnyCert))
            .with_no_client_auth();
        let mut tls = tokio_rustls::TlsConnector::from(Arc::new(client))
            .connect(name.to_string().try_into().unwrap(), client_io)
            .await
            .unwrap();
        let shown = tls.get_ref().1.peer_certificates().unwrap()[0].to_vec();
        tls.write_all(
            format!("GET /who HTTP/1.1\r\nHost: {name}\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .await
        .unwrap();
        let mut out = String::new();
        let _ = tls.read_to_string(&mut out).await;
        (shown, out)
    }

    #[tokio::test]
    async fn a_handed_over_connection_is_served_as_remote_with_the_hostname_certificate() {
        let lan = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
        let lan_key = certified(&lan.cert.pem(), &lan.key_pair.serialize_pem()).unwrap();
        let host = "abcdefghijklmnop.anywhere.test";
        let public = rcgen::generate_simple_self_signed(vec![host.into()]).unwrap();
        *REMOTE.write().unwrap() = Some((
            host.into(),
            certified(&public.cert.pem(), &public.key_pair.serialize_pem()).unwrap(),
        ));

        let (shown, body) = fetch(host, lan_key.clone()).await;
        assert_eq!(
            shown,
            public.cert.der().to_vec(),
            "the hostname gets its own certificate"
        );
        assert!(body.contains("203.0.113.7:5544 remote=true"), "{body}");

        let (shown, _) = fetch("localhost", lan_key).await;
        assert_eq!(
            shown,
            lan.cert.der().to_vec(),
            "any other name gets the LAN one"
        );
        *REMOTE.write().unwrap() = None;
    }

    #[test]
    fn a_pem_pair_loads_and_garbage_does_not() {
        let cert = rcgen::generate_simple_self_signed(vec!["abc.example.test".into()]).unwrap();
        let ok = certified(&cert.cert.pem(), &cert.key_pair.serialize_pem());
        assert!(ok.is_ok());
        assert!(certified("nope", &cert.key_pair.serialize_pem()).is_err());
        assert!(certified(&cert.cert.pem(), "nope").is_err());
    }
}
