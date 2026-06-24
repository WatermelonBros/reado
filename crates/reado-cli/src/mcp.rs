//! `reado mcp` — a Model Context Protocol server (stdio) that exposes the user's
//! Reado annotations to the terminal AI agent as read-only resources, so the
//! agent reads your comments/tasks/reading-progress as structured context instead
//! of a pasted prompt.
//!
//! Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (the MCP stdio
//! convention). Read-only and confined to the project root — no tools, no writes
//! (the agent still mutates tasks through the normal `reado` commands).

use std::io::{BufRead, Write};
use std::path::Path;

use reado_core::{self as core, CommentKind, CommentState};

const PROTOCOL_VERSION: &str = "2024-11-05";

/// Run the stdio server loop until stdin closes.
pub fn serve(root: &str) -> Result<(), Box<dyn std::error::Error>> {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue; // ignore malformed frames
        };
        // Notifications (no `id`) get no response.
        let Some(id) = req.get("id").cloned() else {
            continue;
        };
        let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let msg = match handle(root, method, req.get("params")) {
            Ok(result) => serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => serde_json::json!({
                "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message }
            }),
        };
        writeln!(out, "{}", serde_json::to_string(&msg)?)?;
        out.flush()?;
    }
    Ok(())
}

type RpcResult = Result<serde_json::Value, (i64, String)>;

fn handle(root: &str, method: &str, params: Option<&serde_json::Value>) -> RpcResult {
    match method {
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "resources": {} },
            "serverInfo": { "name": "reado", "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(serde_json::json!({})),
        "tools/list" => Ok(serde_json::json!({ "tools": [] })),
        "resources/list" => Ok(serde_json::json!({ "resources": resource_list() })),
        "resources/read" => {
            let uri = params
                .and_then(|p| p.get("uri"))
                .and_then(|u| u.as_str())
                .ok_or((-32602, "missing uri".into()))?;
            let text = read_resource(root, uri)?;
            Ok(serde_json::json!({
                "contents": [{ "uri": uri, "mimeType": "application/json", "text": text }]
            }))
        }
        other => Err((-32601, format!("method not found: {other}"))),
    }
}

fn resource_list() -> serde_json::Value {
    serde_json::json!([
        { "uri": "reado://tasks", "name": "Open tasks", "description": "Comments flagged as tasks, awaiting resolution.", "mimeType": "application/json" },
        { "uri": "reado://comments", "name": "Comments", "description": "All active comments (anchors, type, thread).", "mimeType": "application/json" },
        { "uri": "reado://reading-progress", "name": "Reading progress", "description": "Project-relative paths the user has marked read.", "mimeType": "application/json" },
        { "uri": "reado://bookmarks", "name": "Bookmarks", "description": "The user's reading bookmarks.", "mimeType": "application/json" },
    ])
}

fn read_resource(root: &str, uri: &str) -> Result<String, (i64, String)> {
    let err = |e: String| (-32603, e);
    match uri {
        "reado://tasks" => {
            let tasks: Vec<_> = core::list_comments(root)
                .into_iter()
                .filter(|c| c.meta.kind == CommentKind::Task && c.meta.state != CommentState::Done)
                .collect();
            serde_json::to_string_pretty(&tasks).map_err(|e| err(e.to_string()))
        }
        "reado://comments" => {
            let all = core::list_comments(root);
            serde_json::to_string_pretty(&all).map_err(|e| err(e.to_string()))
        }
        "reado://reading-progress" => Ok(read_json_file(root, "read.json")),
        "reado://bookmarks" => Ok(read_json_file(root, "bookmarks.json")),
        other => Err((-32602, format!("unknown resource: {other}"))),
    }
}

/// Read a `.reado/<name>` JSON file, defaulting to an empty array.
fn read_json_file(root: &str, name: &str) -> String {
    std::fs::read_to_string(Path::new(root).join(".reado").join(name))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "[]".to_string())
}
