use super::{Api, TermSession, Terminals};
use crate::pairing::Denied;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;

// ---- Interactive terminal (WebSocket ↔ PTY) -------------------------------

#[derive(Deserialize)]
pub(super) struct TermQuery {
    project: String,
    token: String,
}

#[derive(Deserialize)]
pub(super) struct ResizeMsg {
    cols: u16,
    rows: u16,
}

/// Get the live PTY for a project, spawning a fresh login shell if there's none
/// (or the previous one exited). The shell is kept alive across reconnects.
fn get_or_create_term(terminals: &Terminals, key: &str, root: &str) -> Option<Arc<TermSession>> {
    use portable_pty::{native_pty_system, PtySize};
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
    let cmd = crate::pty::shell_command(root, None, None);
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
pub(super) async fn term(
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

pub(super) async fn term_session(socket: WebSocket, session: Arc<TermSession>) {
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
