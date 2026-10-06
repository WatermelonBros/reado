use super::remote::{Remote, WaitEnd};
use super::{Api, Devices};
use crate::pairing::{Denied, RateLimiter};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

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
    pub(super) fn authenticate(&self, secret: &str, peer: IpAddr) -> Result<String, Denied> {
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
pub(super) async fn auth(
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    remote: Option<Extension<Remote>>,
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
        Ok(device) => {
            if remote.is_some() {
                api.remote_seen(&device);
            }
            next.run(req).await
        }
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
pub(super) struct PairBody {
    secret: String,
    /// A name the phone proposes for itself; sanitized before it is stored.
    #[serde(default)]
    name: String,
}

/// The credential a freshly paired phone stores and sends from then on.
#[derive(Serialize)]
pub(super) struct PairedBody {
    token: String,
}

/// A remote pairing waiting for the desktop: the phone shows `code` and polls
/// `/api/pair-wait` with `pending`.
#[derive(Serialize)]
pub(super) struct PendingBody {
    pending: String,
    code: String,
}

/// Whether `peer` may try now; a locked-out peer gets the response to send.
fn throttled(api: &Api, peer: IpAddr) -> Option<Response> {
    let Ok(limiter) = api.limiter.lock() else {
        return Some(StatusCode::SERVICE_UNAVAILABLE.into_response());
    };
    (!limiter.allowed(peer)).then(|| StatusCode::TOO_MANY_REQUESTS.into_response())
}

/// Redeem the pairing secret from the QR for a device credential of the phone's
/// own. The secret is single-use and short-lived, so a photographed QR stops
/// being useful once a phone has spent it.
pub(super) async fn pair(
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    remote: Option<Extension<Remote>>,
    Json(body): Json<PairBody>,
) -> Response {
    let peer = peer.ip();
    // Pairing is unauthenticated by nature, so it is rate-limited like auth —
    // otherwise it would be the one endpoint free to guess against.
    if let Some(refused) = throttled(&api, peer) {
        return refused;
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

    // From outside the network a valid QR is not enough: the desktop has to say
    // yes. The secret is spent either way — Deny means scanning a new QR.
    if remote.is_some() {
        let req = api.request_pair(&body.name);
        crate::log::info(
            "anywhere",
            "remote pairing waits for the desktop",
            serde_json::Value::Null,
        );
        return (
            StatusCode::ACCEPTED,
            Json(PendingBody {
                pending: req.id,
                code: req.code,
            }),
        )
            .into_response();
    }

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

/// What a phone sends to collect a remote pairing's answer.
#[derive(Deserialize)]
pub(super) struct WaitBody {
    pending: String,
}

/// Wait for the desktop's answer to a remote pairing: the credential once it's
/// allowed, 202 while undecided (poll again), 403 on Deny, 410 once it's gone.
pub(super) async fn pair_wait(
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(body): Json<WaitBody>,
) -> Response {
    let peer = peer.ip();
    if let Some(refused) = throttled(&api, peer) {
        return refused;
    }
    match api.wait_pair(&body.pending).await {
        Ok(Some(token)) => Json(PairedBody { token }).into_response(),
        Ok(None) => {
            let code = api.pending_code(&body.pending).unwrap_or_default();
            (
                StatusCode::ACCEPTED,
                Json(PendingBody {
                    pending: body.pending,
                    code,
                }),
            )
                .into_response()
        }
        Err(WaitEnd::Denied) => StatusCode::FORBIDDEN.into_response(),
        Err(WaitEnd::Gone) => {
            // An unknown id is a guess, and counts like one.
            if let Ok(mut l) = api.limiter.lock() {
                l.fail(peer);
            }
            StatusCode::GONE.into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pairing;

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
}
