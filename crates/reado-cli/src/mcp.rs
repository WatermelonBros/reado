//! `reado mcp` — a Model Context Protocol server (stdio) that exposes the user's
//! Reado annotations to the terminal AI agent as read-only resources, so the
//! agent reads your comments/tasks/reading-progress as structured context instead
//! of a pasted prompt.
//!
//! Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (the MCP stdio
//! convention). Read-only and confined to the project root — no tools, no writes
//! (the agent still mutates tasks through the normal `reado` commands).

use std::io::{BufRead, Write};

use reado_core::{self as core, CommentKind, CommentState};

mod browser;
mod review;
mod tasks;

/// Answered to `initialize`, i.e. what we speak to handshake-era ("legacy")
/// clients. Every agent shipping today opens this way.
const PROTOCOL_VERSION: &str = "2024-11-05";

/// Every revision we serve, newest first. `2026-07-28` dropped the handshake:
/// requests carry their version in `_meta` and the server answers statelessly.
/// We serve both eras from this one process — the spec allows it, and legacy
/// clients have no way to fall forward, so we can never drop `initialize`.
const SUPPORTED_VERSIONS: [&str; 2] = ["2026-07-28", "2024-11-05"];

/// `_meta` key carrying the requested revision. Its presence *is* the era
/// signal: no `_meta` version → legacy, and the reply stays byte-identical to
/// what we sent before dual-era support existed.
const META_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO: &str = "io.modelcontextprotocol/serverInfo";

/// Surfaced to the model by the MCP client on connect — orients the agent to
/// Reado's workflow (annotations first, then the live preview). Kept to
/// orientation + steering; per-tool detail lives in each tool/resource
/// description, so this stays short.
const INSTRUCTIONS: &str = "You are a terminal agent working inside Reado, a read-first code IDE. In Reado's loop the user is the reviewer and you are the committer: they annotate the code with comments and tasks, and you resolve them.\n\n\
WORK FROM THEIR ANNOTATIONS: before and while you work, read the user's open tasks and comments via the `reado://tasks` and `reado://comments` resources (plus `reado://reading-progress` and `reado://bookmarks` for context). They carry file/line anchors and are the source of truth for what to do — prefer them over guessing.\n\n\
LIVE BROWSER PREVIEW: when the user asks about their running app, a page, console errors, network, or the DOM, use the `browser_*` tools to inspect and drive Reado's in-app preview — what the user actually sees. Do NOT launch your own browser (Playwright, Chrome, headless) for it; that opens a different, disconnected page. If a browser tool reports 'no preview pane running', ask the user to open the preview and enable agent access.\n\n\
GUIDED REVIEW: when the user starts a Guided Pair Review, Reado sends you a READO GUIDED REVIEW prompt carrying a session id. Drive that session with the `session_show`, `review_context`, `review_plan`, `review_propose_route_change`, `review_propose_comment`, `review_propose`, `review_summarize_file` and `session_summarize` tools rather than composing shell commands — a route is structured data, and a quoting accident in a terminal loses it silently. The loop is: you propose, the human disposes. Never accept your own proposal, never edit code during a review, and never replace a route the human is already walking — propose the change and let them accept it. If the answer to `review_plan` lists uncovered files, they are files the scope contains and your route left out: route them with a proposed change, or mark each one out of scope. Saying a file needs no review is an answer; leaving it out in silence is not.\n\n\
SAY WHEN YOU ARE DONE — AND ONLY THEN: call `session_done` with a one-line summary when your very next act is to *wait for the user*, because the whole request is finished, or you are blocked, or you need an answer. Not when a command returns, not when a step or a tool call finishes, not at a good stopping point in the middle: if you intend to run anything, edit anything or check anything after this call, it is too early, and the user gets pulled back to their desk for nothing. Once per request, not once per action — and do call it when the answer is 'I could not do it', or when the whole answer was one line.\n\n\
Per-tool and per-resource details are in their descriptions. Prefer all of these — they act on the user's real session.";

/// Run the stdio server loop until stdin closes.
pub fn serve(root: &str) -> Result<(), Box<dyn std::error::Error>> {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        // A non-UTF-8 byte on stdin yields Err here; skip that frame instead of
        // tearing down the whole server (and the agent's connection), mirroring
        // the malformed-JSON handling below.
        let Ok(line) = line else {
            continue;
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue; // ignore malformed frames
        };
        let Some(msg) = dispatch(root, &req) else {
            continue;
        };
        writeln!(out, "{}", serde_json::to_string(&msg)?)?;
        out.flush()?;
    }
    Ok(())
}

/// One request in, one JSON-RPC message out (`None` for notifications, which
/// get no reply). Split out of [`serve`] so the era handling is testable
/// without driving stdin.
fn dispatch(root: &str, req: &serde_json::Value) -> Option<serde_json::Value> {
    // Notifications (no `id`) get no response.
    let id = req.get("id").cloned()?;
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = req.get("params");
    let requested = requested_version(params);

    // A version we don't speak is answered with the modern error carrying what
    // we do speak, so the client can retry instead of guessing.
    if let Some(v) = requested
        .as_ref()
        .filter(|v| !SUPPORTED_VERSIONS.contains(&v.as_str()))
    {
        return Some(serde_json::json!({
            "jsonrpc": "2.0", "id": id,
            "error": { "code": -32022, "message": "Unsupported protocol version",
                       "data": { "supported": SUPPORTED_VERSIONS, "requested": v } }
        }));
    }

    Some(match handle(root, method, params) {
        // `server/discover` only exists in the modern era, so its result is
        // always shaped for it — including when a dual-era client probes with
        // it before it has committed to a version.
        Ok(result) if requested.is_some() || method == "server/discover" => {
            serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": modern(result, method) })
        }
        Ok(result) => serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => serde_json::json!({
            "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message }
        }),
    })
}

/// The revision this request declares, if any. Absent → legacy client.
fn requested_version(params: Option<&serde_json::Value>) -> Option<String> {
    params?
        .get("_meta")?
        .get(META_VERSION)?
        .as_str()
        .map(str::to_string)
}

/// Dress a result for the modern era: every result is typed, and the list/read
/// results carry the cache hints that let a client stop re-polling us.
fn modern(mut result: serde_json::Value, method: &str) -> serde_json::Value {
    let Some(obj) = result.as_object_mut() else {
        return result;
    };
    obj.insert("resultType".into(), "complete".into());
    obj.insert(
        "_meta".into(),
        serde_json::json!({ META_SERVER_INFO: server_info() }),
    );
    // Our tool and resource lists are compiled in, so they are good for a long
    // while; a resource *read* is the user's annotations, which change under
    // the agent as they review — short TTL, and never cacheable by a shared
    // intermediary.
    let (ttl_ms, scope) = match method {
        "tools/list" | "resources/list" | "server/discover" => (3_600_000, "public"),
        "resources/read" => (5_000, "private"),
        _ => return result,
    };
    obj.insert("ttlMs".into(), ttl_ms.into());
    obj.insert("cacheScope".into(), scope.into());
    result
}

fn server_info() -> serde_json::Value {
    serde_json::json!({ "name": "reado", "version": env!("CARGO_PKG_VERSION") })
}

type RpcResult = Result<serde_json::Value, RpcError>;

fn handle(root: &str, method: &str, params: Option<&serde_json::Value>) -> RpcResult {
    match method {
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "resources": {}, "tools": {} },
            "serverInfo": server_info(),
            "instructions": INSTRUCTIONS,
        })),
        // Mandatory in the modern era, and the probe a dual-era client sends
        // first on stdio to tell the two eras apart.
        "server/discover" => Ok(serde_json::json!({
            "supportedVersions": SUPPORTED_VERSIONS,
            "capabilities": { "resources": {}, "tools": {} },
            "instructions": INSTRUCTIONS,
        })),
        // Gone in the modern era, still valid for legacy clients.
        "ping" => Ok(serde_json::json!({})),
        "tools/list" => Ok(serde_json::json!({ "tools": tool_list() })),
        "tools/call" => {
            let name = params
                .and_then(|p| p.get("name"))
                .and_then(|n| n.as_str())
                .ok_or((-32602, "missing tool name".into()))?;
            let args = params.and_then(|p| p.get("arguments"));
            let text = call_tool(root, name, args)?;
            // A frame comes back as a PNG data URL → return it as image content the
            // agent can actually see.
            if let Some(b64) = text.strip_prefix("data:image/png;base64,") {
                return Ok(serde_json::json!({
                    "content": [{ "type": "image", "data": b64, "mimeType": "image/png" }]
                }));
            }
            Ok(serde_json::json!({ "content": [{ "type": "text", "text": text }] }))
        }
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
        { "uri": "reado://preview-console", "name": "Preview console", "description": "Console output captured from the in-app browser preview.", "mimeType": "application/json" },
        { "uri": "reado://preview-network", "name": "Preview network", "description": "Network activity captured from the in-app browser preview.", "mimeType": "application/json" },
    ])
}

fn read_resource(root: &str, uri: &str) -> Result<String, RpcError> {
    match uri {
        "reado://tasks" => {
            let tasks: Vec<_> = core::list_comments(root)
                .into_iter()
                .filter(|c| c.meta.kind == CommentKind::Task && c.meta.state != CommentState::Done)
                .collect();
            serde_json::to_string_pretty(&tasks).map_err(internal)
        }
        "reado://comments" => {
            let all = core::list_comments(root);
            serde_json::to_string_pretty(&all).map_err(internal)
        }
        "reado://reading-progress" => Ok(read_json_file(root, core::READ_PROGRESS_FILE)),
        "reado://bookmarks" => Ok(read_json_file(root, core::BOOKMARKS_FILE)),
        "reado://preview-console" => Ok(read_json_file(root, core::PREVIEW_CONSOLE_FILE)),
        "reado://preview-network" => Ok(read_json_file(root, core::PREVIEW_NETWORK_FILE)),
        other => Err((-32602, format!("unknown resource: {other}"))),
    }
}

/// Browser-preview tools: the agent reads the console/network the desktop pane
/// captured (mirrored to `.reado/`). Read-only; a specific error can also be
/// pushed from Reado's inspector via "send to agent".
fn tool_list() -> serde_json::Value {
    let empty = serde_json::json!({ "type": "object", "properties": {} });
    let sel = serde_json::json!({ "type": "object", "properties": { "selector": { "type": "string" } }, "required": ["selector"] });
    // One route entry, spelled out so the agent does not have to guess the
    // field names from a prose description of the JSON.
    let route_entry = serde_json::json!({
        "type": "object",
        "properties": {
            "file": { "type": "string", "description": "Project-relative path." },
            "priority": { "type": "number", "description": "Rank; lower comes first." },
            "reason": { "type": "string", "description": "One line: why this file, and what moved it up." },
            "suggestedReviewMode": { "type": "string", "enum": ["quick", "normal", "deep"] },
            "relatedFiles": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["file", "reason"]
    });
    let route_schema = serde_json::json!({
        "type": "object",
        "properties": {
            "sessionId": { "type": "string" },
            "route": { "type": "array", "items": route_entry.clone() }
        },
        "required": ["route"]
    });
    let route_change_schema = serde_json::json!({
        "type": "object",
        "properties": {
            "sessionId": { "type": "string" },
            "route": { "type": "array", "items": route_entry, "description": "The whole proposed route, not just what changes." },
            "reason": { "type": "string" }
        },
        "required": ["route", "reason"]
    });
    serde_json::json!([
        // Perception (read the captured buffers mirrored to `.reado/`).
        { "name": "browser_console", "description": "The preview page's captured console output (log/info/warn/error, with source and stack).", "inputSchema": empty },
        { "name": "browser_network", "description": "The preview page's captured network activity (method, URL, status, timing; failures flagged).", "inputSchema": empty },
        { "name": "browser_errors", "description": "Only the preview page's console errors and unhandled rejections — what broke.", "inputSchema": empty },
        // Live perception + drive (routed to the running pane over the control queue).
        { "name": "browser_eval", "description": "Evaluate a JS expression in the preview page; returns its JSON result.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "js": { "type": "string" } }, "required": ["js"] }) },
        { "name": "browser_navigate", "description": "Navigate the preview to a URL (confined to localhost + the user's allowlist).", "inputSchema": serde_json::json!({ "type": "object", "properties": { "url": { "type": "string" } }, "required": ["url"] }) },
        { "name": "browser_dom", "description": "Inspect an element: tag, outerHTML (truncated), box, and key computed styles.", "inputSchema": sel.clone() },
        { "name": "browser_animation", "description": "Read an element's animations: keyframes + computed timing (duration, easing, delay).", "inputSchema": sel.clone() },
        { "name": "browser_click", "description": "Click an element (scrolls it into view first).", "inputSchema": sel.clone() },
        { "name": "browser_hover", "description": "Hover an element (dispatch mouseenter/mouseover).", "inputSchema": sel.clone() },
        { "name": "browser_type", "description": "Set an input's value and fire input/change.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "selector": { "type": "string" }, "text": { "type": "string" } }, "required": ["selector", "text"] }) },
        { "name": "browser_scroll", "description": "Scroll the page to (x, y).", "inputSchema": serde_json::json!({ "type": "object", "properties": { "x": { "type": "number" }, "y": { "type": "number" } } }) },
        { "name": "browser_frame", "description": "Capture the current preview render as a PNG image.", "inputSchema": empty },
        // Mutating: the review loop's own verbs, so an agent can close the loop
        // through MCP instead of shelling out to the CLI. Each returns the id and
        // the resulting state, not just "ok".
        { "name": "task_done", "description": "Resolve a task, recording how. With `verify` the command decides: passing marks it done, otherwise it stays resolved-but-unverified for a human.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "id": { "type": "string" }, "diffRef": { "type": "string" }, "verify": { "type": "string" }, "model": { "type": "string" } }, "required": ["id"] }) },
        { "name": "task_fail", "description": "Record a failed attempt on a task, with a note. Past the attempt budget the task blocks itself.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "id": { "type": "string" }, "note": { "type": "string" } }, "required": ["id"] }) },
        { "name": "task_block", "description": "Block a task: you cannot proceed without a human answering first.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "id": { "type": "string" }, "reason": { "type": "string" } }, "required": ["id", "reason"] }) },
        { "name": "comment_add", "description": "Add a comment anchored to a file and line. `kind` is task (the default: it joins the user task queue) or note.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "file": { "type": "string" }, "line": { "type": "number" }, "end": { "type": "number" }, "type": { "type": "string" }, "kind": { "type": "string" }, "body": { "type": "string" } }, "required": ["file", "line", "body"] }) },
        { "name": "mascot_say", "description": "Say one line through Reado's mascot — the small companion in the corner of the user's screen. For the moment the user must know about while they are away from the desk: what you need from them, or what just landed. Not narration, not progress, not a running commentary: it interrupts a human, and a companion that chatters gets turned off. `mood` is done, ask, think or talk (default talk); use `ask` only when you are actually waiting for them.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "text": { "type": "string" }, "mood": { "type": "string" } }, "required": ["text"] }) },
        { "name": "session_done", "description": "Call this when your next act is to wait for the user — the request is finished, you are blocked, or you need an answer. NOT after a command returns or a step completes: if you will do anything else before stopping, it is too early. Reado alerts a user who has walked away, so a premature call fetches them back for nothing. `summary` is one line on what happened; `status` is done (default), blocked or failed.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "summary": { "type": "string" }, "status": { "type": "string" } } }) },
        { "name": "comment_reply", "description": "Reply in a comment's thread.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "id": { "type": "string" }, "body": { "type": "string" } }, "required": ["id", "body"] }) },
        // Guided Pair Review: the session verbs, typed. The CLI carries the same
        // ones for agents without MCP, but a route is an array of objects and a
        // TUI prompt is a line of text — this is the channel where it survives.
        { "name": "session_show", "description": "The guided-review session in full: scope, objective, route, per-file state, proposals, summaries, the files the scope is expected to contain, and any pending route change. Omit `sessionId` for the newest session still open.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" } } }) },
        { "name": "review_context", "description": "One file's context inside a session: its route entry (why it was ranked, related files), its state, its running summary, and the proposals already on it. Read this before reviewing the file.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" }, "file": { "type": "string" } }, "required": ["file"] }) },
        { "name": "review_plan", "description": "Set the session's ranked review route (the planning pass). Answers with the expected files your route left out — route those or mark them out of scope. Refused if the session already has a route: propose a change instead.", "inputSchema": route_schema.clone() },
        { "name": "review_propose_route_change", "description": "Propose a different route mid-session (a file you found that must be reviewed, a reorder). The current route keeps running until the human accepts your proposal in Reado. `reason` is what they read to decide.", "inputSchema": route_change_schema },
        { "name": "review_propose_comment", "description": "Propose an anchored review comment. It is a proposal: the human accepts, edits or discards it. Never final on your own.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" }, "file": { "type": "string" }, "line": { "type": "number" }, "end": { "type": "number" }, "type": { "type": "string", "enum": ["bug", "refactor", "performance", "question", "note"] }, "body": { "type": "string" } }, "required": ["file", "line", "body"] }) },
        { "name": "review_propose", "description": "Propose a non-comment artifact: an open question, a follow-up, or a needs-context marker when you cannot judge the code without more context. Prefer this over guessing.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" }, "kind": { "type": "string", "enum": ["question", "follow-up", "needs-context"] }, "file": { "type": "string" }, "line": { "type": "number" }, "body": { "type": "string" } }, "required": ["kind", "body"] }) },
        { "name": "review_summarize_file", "description": "Record a file's mini-summary when you finish it: what you checked, what the risks are, what comes next.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" }, "file": { "type": "string" }, "text": { "type": "string" } }, "required": ["file", "text"] }) },
        { "name": "session_summarize", "description": "Record the session-level recap — what the review found overall.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "sessionId": { "type": "string" }, "text": { "type": "string" } }, "required": ["text"] }) },
    ])
}

/// A tool's error: a JSON-RPC code and its message.
type RpcError = (i64, String);

/// A server-side failure (`-32603`), as opposed to a bad request.
fn internal(e: impl std::fmt::Display) -> RpcError {
    (-32603, e.to_string())
}

/// A tool call's `arguments`, read leniently: a missing or mistyped field reads
/// as empty/zero, and the tool decides whether that is an error.
#[derive(Clone, Copy)]
struct Args<'a>(Option<&'a serde_json::Value>);

impl Args<'_> {
    fn get(&self, k: &str) -> Option<&serde_json::Value> {
        self.0.and_then(|a| a.get(k))
    }
    fn str(&self, k: &str) -> String {
        self.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }
    fn num(&self, k: &str) -> f64 {
        self.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0)
    }
}

fn call_tool(root: &str, name: &str, args: Option<&serde_json::Value>) -> Result<String, RpcError> {
    use browser::send_command;
    let a = Args(args);
    match name {
        // Perception (read the captured buffers mirrored to `.reado/`).
        "browser_console" => Ok(browser::mirror(root, core::PREVIEW_CONSOLE_FILE)),
        "browser_network" => Ok(browser::mirror(root, core::PREVIEW_NETWORK_FILE)),
        "browser_errors" => browser::errors(root),
        // Live perception + drive over the control queue.
        "browser_eval" => send_command(root, "eval", &a.str("js")),
        "browser_navigate" => send_command(root, "navigate", &a.str("url")),
        "browser_dom" => send_command(root, "eval", &browser::dom_js(&a.str("selector"))),
        "browser_animation" => {
            send_command(root, "eval", &browser::animation_js(&a.str("selector")))
        }
        "browser_click" => send_command(root, "eval", &browser::click_js(&a.str("selector"))),
        "browser_hover" => send_command(root, "eval", &browser::hover_js(&a.str("selector"))),
        "browser_type" => send_command(
            root,
            "eval",
            &browser::type_js(&a.str("selector"), &a.str("text")),
        ),
        "browser_scroll" => send_command(root, "eval", &browser::scroll_js(a.num("x"), a.num("y"))),
        "browser_frame" => send_command(root, "frame", ""),

        // ---- Mutating tools: the review loop's verbs ----
        "task_done" => tasks::task_done(root, a),
        "task_fail" => tasks::task_fail(root, a),
        "task_block" => tasks::task_block(root, a),
        "comment_add" => tasks::comment_add(root, a),
        "comment_reply" => tasks::comment_reply(root, a),
        "mascot_say" => tasks::mascot_say(root, a),
        "session_done" => tasks::session_done(root, a),

        // ---- Guided Pair Review: the session verbs ----
        "session_show" => review::session_show(root, a),
        "review_context" => review::review_context(root, a),
        "review_plan" => review::review_plan(root, a),
        "review_propose_route_change" => review::review_propose_route_change(root, a),
        "review_propose_comment" => review::review_propose_comment(root, a),
        "review_propose" => review::review_propose(root, a),
        "review_summarize_file" => review::review_summarize_file(root, a),
        "session_summarize" => review::session_summarize(root, a),
        other => Err((-32602, format!("unknown tool: {other}"))),
    }
}

/// Read a `.reado/<name>` JSON file, defaulting to an empty array.
fn read_json_file(root: &str, name: &str) -> String {
    std::fs::read_to_string(core::reado_dir(root).join(name))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::browser::{jsq, send_command};
    use super::*;

    fn root_str(dir: &tempfile::TempDir) -> String {
        dir.path().to_str().unwrap().to_string()
    }
    fn reado(dir: &tempfile::TempDir) -> std::path::PathBuf {
        let d = dir.path().join(".reado");
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn initialize_advertises_protocol_and_instructions() {
        let res = handle("/nope", "initialize", None).unwrap();
        assert_eq!(res["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(res["serverInfo"]["name"], "reado");
        // The agent must be steered to the real preview, not its own browser.
        let instr = res["instructions"].as_str().unwrap();
        assert!(instr.contains("browser_*"));
        assert!(instr.contains("Do NOT launch your own browser"));
    }

    /// A request as a client would send it; `version` set means the modern era.
    fn req(method: &str, version: Option<&str>) -> serde_json::Value {
        let params = match version {
            Some(v) => serde_json::json!({ "_meta": { META_VERSION: v } }),
            None => serde_json::json!({}),
        };
        serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    #[test]
    fn legacy_handshake_reply_is_untouched_by_dual_era() {
        let res = dispatch("/nope", &req("initialize", None)).unwrap();
        let result = &res["result"];
        assert_eq!(result["protocolVersion"], PROTOCOL_VERSION);
        // A legacy client must not see any of the modern envelope.
        assert!(result.get("resultType").is_none());
        assert!(result.get("ttlMs").is_none());
        assert!(result.get("_meta").is_none());
    }

    #[test]
    fn discover_advertises_both_eras_and_instructions() {
        // Answered even without `_meta`: this is the stdio era probe.
        let res = dispatch("/nope", &req("server/discover", None)).unwrap();
        let result = &res["result"];
        let versions = result["supportedVersions"].as_array().unwrap();
        assert!(versions.iter().any(|v| v == "2026-07-28"));
        assert!(versions.iter().any(|v| v == PROTOCOL_VERSION));
        assert_eq!(result["resultType"], "complete");
        assert_eq!(result["_meta"][META_SERVER_INFO]["name"], "reado");
        assert!(result["instructions"]
            .as_str()
            .unwrap()
            .contains("browser_*"));
    }

    #[test]
    fn modern_list_result_is_typed_and_cacheable() {
        let res = dispatch("/nope", &req("tools/list", Some("2026-07-28"))).unwrap();
        let result = &res["result"];
        assert_eq!(result["resultType"], "complete");
        assert_eq!(result["cacheScope"], "public");
        assert!(result["ttlMs"].as_i64().unwrap() > 0);
        assert_eq!(result["_meta"][META_SERVER_INFO]["name"], "reado");
        // The whole list is served in one page — no truncation, whatever its size.
        assert_eq!(
            result["tools"].as_array().unwrap().len(),
            tool_list().as_array().unwrap().len()
        );
    }

    #[test]
    fn unsupported_version_reports_what_we_do_speak() {
        let res = dispatch("/nope", &req("tools/list", Some("1900-01-01"))).unwrap();
        assert_eq!(res["error"]["code"], -32022);
        assert_eq!(res["error"]["data"]["requested"], "1900-01-01");
        let supported = res["error"]["data"]["supported"].as_array().unwrap();
        assert!(supported.iter().any(|v| v == "2026-07-28"));
    }

    #[test]
    fn notifications_get_no_reply() {
        let note = serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/cancelled" });
        assert!(dispatch("/nope", &note).is_none());
    }

    #[test]
    fn unknown_method_is_rpc_method_not_found() {
        let err = handle("/nope", "does/not/exist", None).unwrap_err();
        assert_eq!(err.0, -32601);
    }

    #[test]
    fn tool_list_exposes_every_browser_tool() {
        let tools = tool_list();
        let names: Vec<&str> = tools
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        for expected in [
            "browser_console",
            "browser_network",
            "browser_errors",
            "browser_eval",
            "browser_navigate",
            "browser_dom",
            "browser_animation",
            "browser_click",
            "browser_hover",
            "browser_type",
            "browser_scroll",
            "browser_frame",
        ] {
            assert!(
                names.contains(&expected),
                "missing tool {expected} in {names:?}"
            );
        }
        // The mutating half: the review loop's verbs, so an agent can close a
        // task through MCP rather than shelling out to the CLI.
        for expected in [
            // The end-of-turn handoff: without it Reado can't tell a user who
            // walked away that the agent is back.
            "session_done",
            // The one way words reach the companion's bubble.
            "mascot_say",
            "task_done",
            "task_fail",
            "task_block",
            "comment_add",
            "comment_reply",
        ] {
            assert!(
                names.contains(&expected),
                "missing tool {expected} in {names:?}"
            );
        }
        // Every name is distinct: a duplicate would shadow a tool silently.
        let mut unique = names.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(
            unique.len(),
            names.len(),
            "duplicate tool name in {names:?}"
        );
    }

    #[test]
    fn absent_mirror_reads_as_no_preview() {
        let dir = tempfile::tempdir().unwrap();
        // No `.reado/` file → the perception tools must say so, not return "[]".
        let out = call_tool(&root_str(&dir), "browser_console", None).unwrap();
        assert!(out.contains("No preview pane running"), "got: {out}");
    }

    #[test]
    fn present_mirror_returns_its_contents() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            reado(&dir).join("preview-console.json"),
            r#"[{"level":"log"}]"#,
        )
        .unwrap();
        let out = call_tool(&root_str(&dir), "browser_console", None).unwrap();
        assert!(out.contains("\"level\":\"log\""), "got: {out}");
    }

    #[test]
    fn errors_tool_filters_to_error_level_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            reado(&dir).join("preview-console.json"),
            r#"[{"level":"log","args":["ok"]},{"level":"error","args":["boom"]}]"#,
        )
        .unwrap();
        let out = call_tool(&root_str(&dir), "browser_errors", None).unwrap();
        assert!(out.contains("boom"), "error should surface: {out}");
        assert!(
            !out.contains("\"ok\""),
            "non-errors must be filtered: {out}"
        );
    }

    #[test]
    fn errors_tool_reports_clean_when_no_errors() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            reado(&dir).join("preview-console.json"),
            r#"[{"level":"warn"}]"#,
        )
        .unwrap();
        let out = call_tool(&root_str(&dir), "browser_errors", None).unwrap();
        assert_eq!(out, "No errors captured.");
    }

    #[test]
    fn a_mutating_tool_returns_the_new_state_not_just_ok() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();

        let added = call_tool(
            &root,
            "comment_add",
            Some(&serde_json::json!({
                "file": "src.rs", "line": 1, "kind": "task", "type": "bug", "body": "leaks"
            })),
        )
        .unwrap();
        let added: serde_json::Value = serde_json::from_str(&added).unwrap();
        assert_eq!(added["action"], "comment_add");
        assert_eq!(added["state"], "open");
        let id = added["id"].as_str().unwrap().to_string();

        // Resolving without a verification is a claim, not a proof, and the
        // result says so rather than reporting a bare success.
        let done = call_tool(&root, "task_done", Some(&serde_json::json!({ "id": id }))).unwrap();
        let done: serde_json::Value = serde_json::from_str(&done).unwrap();
        assert_eq!(done["state"], "resolved-unverified");
        assert_eq!(done["resolution"]["agent"], crate::ops::agent_id());
    }

    #[test]
    fn comment_add_defaults_to_a_task_like_the_cli() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();
        let add = |args: serde_json::Value| {
            let out = call_tool(&root, "comment_add", Some(&args)).unwrap();
            let id = serde_json::from_str::<serde_json::Value>(&out).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            core::get_comment(&root, &id).unwrap().meta.kind
        };
        let task = add(serde_json::json!({ "file": "src.rs", "line": 1, "body": "x" }));
        assert_eq!(task, CommentKind::Task);
        let note =
            add(serde_json::json!({ "file": "src.rs", "line": 1, "kind": "note", "body": "y" }));
        assert_eq!(note, CommentKind::Note);
    }

    #[test]
    fn a_verified_resolution_is_done_and_carries_its_evidence() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();
        let added = call_tool(
            &root,
            "comment_add",
            Some(&serde_json::json!({ "file": "src.rs", "line": 1, "kind": "task", "body": "x" })),
        )
        .unwrap();
        let id = serde_json::from_str::<serde_json::Value>(&added).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let done = call_tool(
            &root,
            "task_done",
            Some(&serde_json::json!({ "id": id, "verify": "exit 0", "diffRef": "abc123" })),
        )
        .unwrap();
        let done: serde_json::Value = serde_json::from_str(&done).unwrap();
        assert_eq!(done["state"], "done");
        assert_eq!(done["resolution"]["verify"]["passed"], true);
        assert_eq!(done["resolution"]["verify"]["cmd"], "exit 0");
        assert_eq!(done["resolution"]["diffRef"], "abc123");
    }

    #[test]
    fn a_failing_verification_leaves_the_task_unverified() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();
        let added = call_tool(
            &root,
            "comment_add",
            Some(&serde_json::json!({ "file": "src.rs", "line": 1, "kind": "task", "body": "x" })),
        )
        .unwrap();
        let id = serde_json::from_str::<serde_json::Value>(&added).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let done = call_tool(
            &root,
            "task_done",
            Some(&serde_json::json!({ "id": id, "verify": "exit 1" })),
        )
        .unwrap();
        let done: serde_json::Value = serde_json::from_str(&done).unwrap();
        assert_eq!(done["state"], "resolved-unverified");
        assert_eq!(done["resolution"]["verify"]["passed"], false);
    }

    #[test]
    fn task_fail_reports_the_attempt_count_it_reached() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();
        let added = call_tool(
            &root,
            "comment_add",
            Some(&serde_json::json!({ "file": "src.rs", "line": 1, "kind": "task", "body": "x" })),
        )
        .unwrap();
        let id = serde_json::from_str::<serde_json::Value>(&added).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let failed = call_tool(
            &root,
            "task_fail",
            Some(&serde_json::json!({ "id": id, "note": "cannot tell which anchor" })),
        )
        .unwrap();
        let failed: serde_json::Value = serde_json::from_str(&failed).unwrap();
        assert_eq!(failed["attempts"], 1);
        assert_eq!(failed["state"], "open");
    }

    #[test]
    fn task_block_reports_the_reason_back() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(dir.path().join("src.rs"), "fn main() {}\n").unwrap();
        let added = call_tool(
            &root,
            "comment_add",
            Some(&serde_json::json!({ "file": "src.rs", "line": 1, "kind": "task", "body": "x" })),
        )
        .unwrap();
        let id = serde_json::from_str::<serde_json::Value>(&added).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let blocked = call_tool(
            &root,
            "task_block",
            Some(&serde_json::json!({ "id": id, "reason": "which anchor?" })),
        )
        .unwrap();
        let blocked: serde_json::Value = serde_json::from_str(&blocked).unwrap();
        assert_eq!(blocked["state"], "blocked");
        assert_eq!(blocked["blockedReason"], "which anchor?");
    }

    #[test]
    fn every_listed_tool_is_dispatched() {
        // A tool in `tool_list` that `call_tool` does not route is advertised to
        // the agent and then refused as unknown. Root it under a regular *file*
        // so `.reado/` can never be created: every tool fails at its first write
        // (the browser queue included, before it starts polling for a pane).
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("not-a-dir");
        std::fs::write(&file, "").unwrap();
        let root = file.join("project").to_string_lossy().into_owned();
        let started = std::time::Instant::now();
        for tool in tool_list().as_array().unwrap() {
            let name = tool["name"].as_str().unwrap();
            if let Err((_, msg)) = call_tool(&root, name, Some(&serde_json::json!({}))) {
                assert!(
                    !msg.starts_with("unknown tool"),
                    "{name} is listed but not dispatched"
                );
            }
        }
        assert!(
            started.elapsed() < std::time::Duration::from_secs(2),
            "a tool waited instead of failing fast"
        );
    }

    #[test]
    fn unknown_tool_is_invalid_params() {
        let dir = tempfile::tempdir().unwrap();
        let err = call_tool(&root_str(&dir), "browser_teleport", None).unwrap_err();
        assert_eq!(err.0, -32602);
    }

    #[test]
    fn read_json_file_defaults_to_empty_array() {
        let dir = tempfile::tempdir().unwrap();
        // Missing file → "[]".
        assert_eq!(read_json_file(&root_str(&dir), "nope.json"), "[]");
        // Whitespace-only file → "[]", never a blank the client can't parse.
        std::fs::write(reado(&dir).join("blank.json"), "  \n").unwrap();
        assert_eq!(read_json_file(&root_str(&dir), "blank.json"), "[]");
    }

    #[test]
    fn jsq_quotes_and_escapes_for_safe_eval_embedding() {
        assert_eq!(jsq("a\"b"), "\"a\\\"b\"");
        assert_eq!(jsq("#id .cls"), "\"#id .cls\"");
    }

    #[test]
    fn send_command_round_trips_with_a_simulated_pane() {
        let dir = tempfile::tempdir().unwrap();
        let reado_dir = reado(&dir);
        let root = root_str(&dir);
        // Simulate the desktop pane: wait for the command, echo a result for its id.
        let handle = std::thread::spawn(move || {
            let cmd_path = reado_dir.join(core::PREVIEW_CMD_FILE);
            for _ in 0..100 {
                std::thread::sleep(std::time::Duration::from_millis(20));
                let Ok(s) = std::fs::read_to_string(&cmd_path) else {
                    continue;
                };
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
                    continue;
                };
                let id = v["id"].as_str().unwrap().to_string();
                let out = serde_json::json!({ "id": id, "ok": true, "result": "42" });
                std::fs::write(reado_dir.join(core::PREVIEW_RESULT_FILE), out.to_string()).unwrap();
                return;
            }
        });
        let res = send_command(&root, "eval", "6*7").unwrap();
        handle.join().unwrap();
        assert_eq!(res, "42");
    }

    #[test]
    fn send_command_surfaces_a_pane_side_error() {
        let dir = tempfile::tempdir().unwrap();
        let reado_dir = reado(&dir);
        let root = root_str(&dir);
        let handle = std::thread::spawn(move || {
            let cmd_path = reado_dir.join(core::PREVIEW_CMD_FILE);
            for _ in 0..100 {
                std::thread::sleep(std::time::Duration::from_millis(20));
                let Ok(s) = std::fs::read_to_string(&cmd_path) else {
                    continue;
                };
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
                    continue;
                };
                let id = v["id"].as_str().unwrap().to_string();
                let out =
                    serde_json::json!({ "id": id, "ok": false, "result": "origin not allowed" });
                std::fs::write(reado_dir.join(core::PREVIEW_RESULT_FILE), out.to_string()).unwrap();
                return;
            }
        });
        let err = send_command(&root, "navigate", "http://evil.example").unwrap_err();
        handle.join().unwrap();
        assert_eq!(err.0, -32603);
        assert_eq!(err.1, "origin not allowed");
    }

    #[test]
    fn tools_call_wraps_a_frame_as_image_content() {
        // A data-URL result from a tool becomes MCP image content, not text.
        let dir = tempfile::tempdir().unwrap();
        let reado_dir = reado(&dir);
        let root = root_str(&dir);
        let handle = std::thread::spawn(move || {
            let cmd_path = reado_dir.join(core::PREVIEW_CMD_FILE);
            for _ in 0..100 {
                std::thread::sleep(std::time::Duration::from_millis(20));
                let Ok(s) = std::fs::read_to_string(&cmd_path) else {
                    continue;
                };
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
                    continue;
                };
                let id = v["id"].as_str().unwrap().to_string();
                let out = serde_json::json!({ "id": id, "ok": true, "result": "data:image/png;base64,AAAA" });
                std::fs::write(reado_dir.join(core::PREVIEW_RESULT_FILE), out.to_string()).unwrap();
                return;
            }
        });
        let params = serde_json::json!({ "name": "browser_frame", "arguments": {} });
        let res = handle_call(&root, &params);
        handle.join().unwrap();
        assert_eq!(res["content"][0]["type"], "image");
        assert_eq!(res["content"][0]["data"], "AAAA");
        assert_eq!(res["content"][0]["mimeType"], "image/png");
    }

    #[test]
    fn mascot_say_refuses_what_a_bubble_cannot_carry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        // Empty and over-long are refused, not silently trimmed: the agent has to
        // know its message did not arrive whole.
        for bad in ["", "   ", &"x".repeat(core::MASCOT_MAX + 1)] {
            let res = handle(
                &root,
                "tools/call",
                Some(&serde_json::json!({ "name": "mascot_say", "arguments": { "text": bad } })),
            );
            // A refusal reaches the agent as an error it can read and act on.
            assert!(res.is_err(), "{bad:?} should have been refused");
        }
        assert!(!dir.path().join(".reado/mascot.json").exists());

        handle_call(
            &root,
            &serde_json::json!({
                "name": "mascot_say",
                "arguments": { "text": "  ready when you are  ", "mood": "ask" }
            }),
        );
        let said: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.path().join(".reado/mascot.json")).unwrap())
                .unwrap();
        assert_eq!(said["text"], "ready when you are");
        assert_eq!(said["mood"], "ask");
    }

    #[test]
    fn session_done_records_the_handoff_the_watcher_watches_for() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();

        let res = handle_call(
            &root,
            &serde_json::json!({
                "name": "session_done",
                "arguments": { "status": "blocked", "summary": "needs the API key" }
            }),
        );
        assert_eq!(res["content"][0]["type"], "text");

        let written: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.path().join(".reado/done.json")).unwrap())
                .unwrap();
        assert_eq!(written["status"], "blocked");
        assert_eq!(written["summary"], "needs the API key");
    }

    #[test]
    fn session_done_defaults_to_done_for_an_unknown_status() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        // An agent inventing a status must not put an unknown word in front of
        // the user; and calling it bare is the common case.
        handle_call(
            &root,
            &serde_json::json!({ "name": "session_done", "arguments": { "status": "whatever" } }),
        );
        let v: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.path().join(".reado/done.json")).unwrap())
                .unwrap();
        assert_eq!(v["status"], "done");
        assert_eq!(v["summary"], "");
    }

    // Thin wrapper so the image-vs-text branch of `handle` is exercised directly.
    fn handle_call(root: &str, params: &serde_json::Value) -> serde_json::Value {
        handle(root, "tools/call", Some(params)).unwrap()
    }

    // ---- Guided Pair Review over MCP ----

    /// A session with a known file set, as the desktop creates one for a diff.
    fn guided_session(root: &str, expected: &[&str]) -> core::Session {
        core::create_session(
            root,
            core::NewSession {
                title: "Review the diff".into(),
                scope: core::ReviewScope {
                    kind: core::ScopeKind::Diff,
                    base: None,
                    paths: vec![],
                    pr: None,
                    request: None,
                },
                objective: Some(core::Objective::Security),
                expected_files: expected.iter().map(|f| f.to_string()).collect(),
            },
            None,
        )
        .unwrap()
    }

    fn text_of(res: &serde_json::Value) -> String {
        res["content"][0]["text"].as_str().unwrap_or("").to_string()
    }

    fn route_json(files: &[&str]) -> serde_json::Value {
        serde_json::Value::Array(
            files
                .iter()
                .enumerate()
                .map(|(i, f)| {
                    serde_json::json!({ "file": f, "priority": i + 1, "reason": "changed", "suggestedReviewMode": "normal" })
                })
                .collect(),
        )
    }

    #[test]
    fn the_session_verbs_are_tools() {
        let tools = tool_list();
        let names: Vec<&str> = tools
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        for expected in [
            "session_show",
            "review_context",
            "review_plan",
            "review_propose_route_change",
            "review_propose_comment",
            "review_propose",
            "review_summarize_file",
            "session_summarize",
        ] {
            assert!(names.contains(&expected), "missing tool: {expected}");
        }
        // The route's field names are in the schema, not only in prose.
        let plan = tools
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == "review_plan")
            .cloned()
            .unwrap();
        let props = &plan["inputSchema"]["properties"]["route"]["items"]["properties"];
        assert!(props.get("suggestedReviewMode").is_some());
        assert!(props.get("relatedFiles").is_some());
    }

    #[test]
    fn instructions_carry_the_guided_contract_for_every_vendor() {
        // This is the only channel that reaches a non-Claude agent: the
        // system-prompt flag Reado passes at launch exists for one CLI.
        let instr = handle("/nope", "initialize", None).unwrap()["instructions"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(instr.contains("review_plan"));
        assert!(instr.contains("propose"));
        assert!(instr.contains("uncovered"));
    }

    #[test]
    fn review_plan_sets_the_route_and_names_what_it_missed() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        let s = guided_session(&root, &["a.rs", "b.rs", "untracked.rs"]);

        let res = handle_call(
            &root,
            &serde_json::json!({
                "name": "review_plan",
                "arguments": { "sessionId": s.id, "route": route_json(&["a.rs"]) }
            }),
        );
        let out: serde_json::Value = serde_json::from_str(&text_of(&res)).unwrap();
        assert_eq!(out["routed"], 1);
        let uncovered: Vec<String> = serde_json::from_value(out["uncovered"].clone()).unwrap();
        assert_eq!(uncovered, vec!["b.rs", "untracked.rs"]);
        assert!(out["note"].as_str().unwrap().contains("not in your route"));

        // Planning again is refused — the human is walking that route.
        let err = call_tool(
            &root,
            "review_plan",
            Some(&serde_json::json!({ "sessionId": s.id, "route": route_json(&["z.rs"]) })),
        )
        .unwrap_err();
        assert!(err.1.contains("propose"), "got: {}", err.1);
        assert_eq!(core::get_session(&root, &s.id).unwrap().route.len(), 1);
    }

    #[test]
    fn a_route_change_is_proposed_not_applied() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        let s = guided_session(&root, &["a.rs", "b.rs"]);
        handle_call(
            &root,
            &serde_json::json!({
                "name": "review_plan",
                "arguments": { "sessionId": s.id, "route": route_json(&["a.rs"]) }
            }),
        );
        let res = handle_call(
            &root,
            &serde_json::json!({
                "name": "review_propose_route_change",
                "arguments": { "sessionId": s.id, "route": route_json(&["a.rs", "b.rs"]),
                               "reason": "b.rs is the only caller of the changed function" }
            }),
        );
        assert!(text_of(&res).contains("unchanged until the human"));
        let after = core::get_session(&root, &s.id).unwrap();
        assert_eq!(after.route.len(), 1, "the route must not move on its own");
        assert_eq!(after.route_change.unwrap().route.len(), 2);
    }

    #[test]
    fn a_route_change_without_a_reason_is_refused() {
        // The reason is the whole basis on which the human decides; a change
        // without one is a change they cannot dispose of.
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        let s = guided_session(&root, &["a.rs"]);
        let err = call_tool(
            &root,
            "review_propose_route_change",
            Some(&serde_json::json!({ "sessionId": s.id, "route": route_json(&["a.rs"]), "reason": "  " })),
        )
        .unwrap_err();
        assert_eq!(err.0, -32602);
        assert!(err.1.contains("reason"));
    }

    #[test]
    fn a_malformed_route_says_which_fields_it_wanted() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        let s = guided_session(&root, &[]);
        let err = call_tool(
            &root,
            "review_plan",
            Some(&serde_json::json!({ "sessionId": s.id, "route": ["a.rs"] })),
        )
        .unwrap_err();
        assert_eq!(err.0, -32602);
        assert!(err.1.contains("suggestedReviewMode"));
    }

    #[test]
    fn session_tools_find_the_open_session_without_an_id() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        let s = guided_session(&root, &["a.rs"]);
        let shown: serde_json::Value = serde_json::from_str(&text_of(&handle_call(
            &root,
            &serde_json::json!({ "name": "session_show", "arguments": {} }),
        )))
        .unwrap();
        assert_eq!(shown["id"], s.id);
        assert_eq!(shown["objective"], "security");
        assert_eq!(shown["expectedFiles"][0], "a.rs");

        // Closed sessions are not picked up.
        core::close_session(&root, &s.id).unwrap();
        let err = call_tool(&root, "session_show", None).unwrap_err();
        assert!(err.1.contains("no open guided-review session"));
    }

    #[test]
    fn proposals_and_summaries_land_on_the_session() {
        let dir = tempfile::tempdir().unwrap();
        let root = root_str(&dir);
        std::fs::write(
            dir.path().join("a.rs"),
            "fn main() {}
",
        )
        .unwrap();
        let s = guided_session(&root, &["a.rs"]);
        handle_call(
            &root,
            &serde_json::json!({
                "name": "review_plan",
                "arguments": { "sessionId": s.id, "route": route_json(&["a.rs"]) }
            }),
        );
        handle_call(
            &root,
            &serde_json::json!({
                "name": "review_propose_comment",
                "arguments": { "sessionId": s.id, "file": "a.rs", "line": 1, "type": "bug", "body": "unwrap on a user path" }
            }),
        );
        handle_call(
            &root,
            &serde_json::json!({
                "name": "review_propose",
                "arguments": { "sessionId": s.id, "kind": "needs-context", "file": "a.rs", "line": 1, "body": "who calls this?" }
            }),
        );
        handle_call(
            &root,
            &serde_json::json!({
                "name": "review_summarize_file",
                "arguments": { "sessionId": s.id, "file": "a.rs", "text": "checked the error paths" }
            }),
        );
        handle_call(
            &root,
            &serde_json::json!({ "name": "session_summarize", "arguments": { "sessionId": s.id, "text": "one real bug" } }),
        );

        let after = core::get_session(&root, &s.id).unwrap();
        assert_eq!(after.proposals.len(), 2);
        // Proposed, never accepted — the human disposes.
        assert!(after
            .proposals
            .iter()
            .all(|p| p.state == core::ArtifactState::Proposed));
        assert!(after
            .proposals
            .iter()
            .any(|p| p.artifact_type == core::ArtifactType::NeedsContext));
        assert_eq!(after.summary.as_deref(), Some("one real bug"));
        assert_eq!(
            after
                .files
                .iter()
                .find(|f| f.file == "a.rs")
                .unwrap()
                .summary
                .as_deref(),
            Some("checked the error paths")
        );

        // And the file's context comes back with the objective that shapes it.
        let ctx: serde_json::Value = serde_json::from_str(&text_of(&handle_call(
            &root,
            &serde_json::json!({ "name": "review_context", "arguments": { "sessionId": s.id, "file": "a.rs" } }),
        )))
        .unwrap();
        assert_eq!(ctx["objective"], "security");
        assert_eq!(ctx["proposals"].as_array().unwrap().len(), 2);
        assert_eq!(ctx["summary"], "checked the error paths");
    }

    #[test]
    fn unknown_resource_is_invalid_params() {
        let err = read_resource("/nope", "reado://mystery").unwrap_err();
        assert_eq!(err.0, -32602);
    }
}
