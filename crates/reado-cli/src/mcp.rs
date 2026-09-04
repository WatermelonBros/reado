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
SAY WHEN YOU ARE DONE: the moment you finish a turn and are handing control back — the work is complete, or you are blocked, or you need an answer — call `session_done` with a one-line summary. The user has usually walked away from the desk; this is what tells Reado to get their attention. Call it exactly once per turn, as the last thing you do, and call it even when the answer is 'I could not do it'.\n\n\
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

type RpcResult = Result<serde_json::Value, (i64, String)>;

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
        "reado://preview-console" => Ok(read_json_file(root, "preview-console.json")),
        "reado://preview-network" => Ok(read_json_file(root, "preview-network.json")),
        other => Err((-32602, format!("unknown resource: {other}"))),
    }
}

/// Browser-preview tools: the agent reads the console/network the desktop pane
/// captured (mirrored to `.reado/`). Read-only; a specific error can also be
/// pushed from Reado's inspector via "send to agent".
fn tool_list() -> serde_json::Value {
    let empty = serde_json::json!({ "type": "object", "properties": {} });
    let sel = serde_json::json!({ "type": "object", "properties": { "selector": { "type": "string" } }, "required": ["selector"] });
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
        { "name": "comment_add", "description": "Add a comment anchored to a file and line. `kind` is task (sent to the AI batch) or note.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "file": { "type": "string" }, "line": { "type": "number" }, "end": { "type": "number" }, "type": { "type": "string" }, "kind": { "type": "string" }, "body": { "type": "string" } }, "required": ["file", "line", "body"] }) },
        { "name": "session_done", "description": "Call this as the LAST thing in every turn, when you are handing control back to the user — finished, blocked, or out of questions. Reado uses it to alert a user who has walked away. `summary` is one line on what happened; `status` is done (default), blocked or failed.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "summary": { "type": "string" }, "status": { "type": "string" } } }) },
        { "name": "comment_reply", "description": "Reply in a comment's thread.", "inputSchema": serde_json::json!({ "type": "object", "properties": { "id": { "type": "string" }, "body": { "type": "string" } }, "required": ["id", "body"] }) },
    ])
}

/// A comment type by name, defaulting to `note` for anything unrecognised —
/// an agent's typo should not fail the write.
fn parse_type(name: &str) -> core::CommentType {
    match name {
        "bug" => core::CommentType::Bug,
        "refactor" => core::CommentType::Refactor,
        "performance" => core::CommentType::Performance,
        "question" => core::CommentType::Question,
        _ => core::CommentType::Note,
    }
}

/// The agent identity mutations are attributed to. Same source as the CLI's, so
/// a task resolved over MCP and one resolved from a shell read the same.
fn agent_id() -> String {
    std::env::var("READO_AGENT")
        .ok()
        .filter(|a| !a.is_empty())
        .unwrap_or_else(|| "agent".to_string())
}

/// A structured result for a mutating tool: what changed, and what it is now.
fn mutation_result(c: &core::Comment, action: &str) -> Result<String, (i64, String)> {
    serde_json::to_string_pretty(&serde_json::json!({
        "action": action,
        "id": c.meta.id,
        "state": c.meta.state,
        "attempts": c.meta.attempts,
        "blockedReason": c.meta.blocked_reason,
        "resolution": c.meta.resolution,
    }))
    .map_err(|e| (-32603, e.to_string()))
}

/// Send a command to the running preview pane over the file queue and wait for its
/// result (the pane polls ~0.7s; we poll up to ~6s). No pane → timeout.
fn send_command(root: &str, op: &str, arg: &str) -> Result<String, (i64, String)> {
    let dir = Path::new(root).join(".reado");
    std::fs::create_dir_all(&dir).map_err(|e| (-32603, e.to_string()))?;
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
        .to_string();
    let cmd = serde_json::json!({ "id": id, "op": op, "arg": arg });
    std::fs::write(dir.join("preview-cmd.json"), cmd.to_string())
        .map_err(|e| (-32603, e.to_string()))?;
    let result_path = dir.join("preview-result.json");
    for _ in 0..60 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let Ok(s) = std::fs::read_to_string(&result_path) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) else {
            continue;
        };
        if v.get("id").and_then(|i| i.as_str()) != Some(id.as_str()) {
            continue;
        }
        let ok = v.get("ok").and_then(|o| o.as_bool()).unwrap_or(false);
        let res = v
            .get("result")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string();
        return if ok { Ok(res) } else { Err((-32603, res)) };
    }
    Err((
        -32603,
        "no preview pane running (open the browser preview and enable agent access)".into(),
    ))
}

/// JS-quote a string for safe embedding in an eval expression.
fn jsq(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

fn call_tool(
    root: &str,
    name: &str,
    args: Option<&serde_json::Value>,
) -> Result<String, (i64, String)> {
    // The mirror file's *presence* means a preview is live (it's written every tick
    // while agent access is on). An absent file → no preview; a present `[]` →
    // preview live but nothing captured yet.
    let read = |file: &str| -> String {
        let path = Path::new(root).join(".reado").join(file);
        if !path.exists() {
            "No preview pane running — open the browser preview in Reado.".to_string()
        } else {
            read_json_file(root, file)
        }
    };
    let sarg = |k: &str| {
        args.and_then(|a| a.get(k))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let narg = |k: &str| {
        args.and_then(|a| a.get(k))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
    };
    match name {
        "browser_console" => Ok(read("preview-console.json")),
        "browser_network" => Ok(read("preview-network.json")),
        // Live perception + drive over the control queue. Drive actions ship JS the
        // pane runs via the CSP-immune eval channel; navigation is allowlist-checked.
        "browser_eval" => send_command(root, "eval", &sarg("js")),
        "browser_navigate" => send_command(root, "navigate", &sarg("url")),
        "browser_dom" => send_command(root, "eval", &format!(
            "(()=>{{const el=document.querySelector({s});if(!el)return null;const r=el.getBoundingClientRect();const c=getComputedStyle(el);return{{tag:el.tagName,html:el.outerHTML.slice(0,2000),rect:{{x:r.x,y:r.y,w:r.width,h:r.height}},display:c.display,color:c.color,background:c.backgroundColor,font:c.font}};}})()",
            s = jsq(&sarg("selector")))),
        "browser_animation" => send_command(root, "eval", &format!(
            "(()=>{{const el=document.querySelector({s});if(!el)return null;return el.getAnimations().map(a=>({{name:a.animationName,timing:a.effect.getComputedTiming(),keyframes:a.effect.getKeyframes()}}));}})()",
            s = jsq(&sarg("selector")))),
        "browser_click" => send_command(root, "eval", &format!(
            "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.scrollIntoView({{block:'center'}});el.click();return'clicked';}})()",
            s = jsq(&sarg("selector")))),
        "browser_hover" => send_command(root, "eval", &format!(
            "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.dispatchEvent(new MouseEvent('mouseover',{{bubbles:true}}));el.dispatchEvent(new MouseEvent('mouseenter',{{bubbles:true}}));return'hovered';}})()",
            s = jsq(&sarg("selector")))),
        "browser_type" => send_command(root, "eval", &format!(
            "(()=>{{const el=document.querySelector({s});if(!el)return'not found';el.focus();el.value={t};el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));return'typed';}})()",
            s = jsq(&sarg("selector")), t = jsq(&sarg("text")))),
        "browser_scroll" => send_command(root, "eval", &format!(
            "(()=>{{window.scrollTo({x},{y});return'scrolled';}})()",
            x = narg("x"), y = narg("y"))),
        "browser_frame" => send_command(root, "frame", ""),

        // ---- Mutating tools: the review loop's verbs ----
        "task_done" => {
            let verify = sarg("verify");
            let verification = (!verify.is_empty()).then(|| core::Verification {
                passed: crate::run_verify(root, &verify),
                cmd: verify,
            });
            let model = {
                let m = sarg("model");
                if m.is_empty() {
                    std::env::var("READO_MODEL").ok().filter(|v| !v.is_empty())
                } else {
                    Some(m)
                }
            };
            let diff_ref = {
                let d = sarg("diffRef");
                (!d.is_empty()).then_some(d)
            };
            let c = core::resolve_comment(
                root,
                &sarg("id"),
                core::Resolution {
                    agent: agent_id(),
                    model,
                    diff_ref,
                    verify: verification,
                    at: crate::now_millis(),
                },
            )
            .map_err(|e| (-32603, e.to_string()))?;
            mutation_result(&c, "task_done")
        }
        "task_fail" => {
            let note = sarg("note");
            if !note.is_empty() {
                core::add_reply(root, &sarg("id"), "agent", Some(agent_id()), note)
                    .map_err(|e| (-32603, e.to_string()))?;
            }
            let c = core::fail_attempt(root, &sarg("id")).map_err(|e| (-32603, e.to_string()))?;
            mutation_result(&c, "task_fail")
        }
        "session_done" => {
            let status = match sarg("status").as_str() {
                "blocked" => "blocked",
                "failed" => "failed",
                _ => "done",
            };
            core::mark_session_done(root, status, &sarg("summary"))
                .map_err(|e| (-32603, e.to_string()))?;
            Ok("Noted — Reado will let the user know.".to_string())
        }
        "task_block" => {
            let c = core::block_comment(root, &sarg("id"), &sarg("reason"))
                .map_err(|e| (-32603, e.to_string()))?;
            mutation_result(&c, "task_block")
        }
        "comment_add" => {
            let line = narg("line") as u32;
            let end = narg("end") as u32;
            let kind = if sarg("kind") == "task" {
                CommentKind::Task
            } else {
                CommentKind::Note
            };
            let created = core::create_comment(
                root,
                core::NewComment {
                    file: sarg("file"),
                    scope: core::Scope::Range,
                    start_line: line.max(1),
                    end_line: if end >= line.max(1) { end } else { line.max(1) },
                    comment_type: parse_type(&sarg("type")),
                    kind,
                    body: sarg("body"),
                    context: core::Context::default(),
                    url: None,
                    x: None,
                    y: None,
                },
                "agent",
                Some(agent_id()),
            )
            .map_err(|e| (-32603, e.to_string()))?;
            mutation_result(&created.comment, "comment_add")
        }
        "comment_reply" => {
            let c = core::add_reply(
                root,
                &sarg("id"),
                "agent",
                Some(agent_id()),
                sarg("body"),
            )
            .map_err(|e| (-32603, e.to_string()))?;
            mutation_result(&c, "comment_reply")
        }
        "browser_errors" => {
            if !Path::new(root).join(".reado").join("preview-console.json").exists() {
                return Ok("No preview pane running — open the browser preview in Reado.".to_string());
            }
            let raw = read_json_file(root, "preview-console.json");
            let entries: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap_or_default();
            let errors: Vec<_> = entries
                .into_iter()
                .filter(|e| e.get("level").and_then(|l| l.as_str()) == Some("error"))
                .collect();
            if errors.is_empty() {
                Ok("No errors captured.".to_string())
            } else {
                serde_json::to_string_pretty(&errors).map_err(|e| (-32603, e.to_string()))
            }
        }
        other => Err((-32602, format!("unknown tool: {other}"))),
    }
}

/// Read a `.reado/<name>` JSON file, defaulting to an empty array.
fn read_json_file(root: &str, name: &str) -> String {
    std::fs::read_to_string(Path::new(root).join(".reado").join(name))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "[]".to_string())
}

#[cfg(test)]
mod tests {
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
        assert_eq!(result["tools"].as_array().unwrap().len(), 18);
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
        assert_eq!(names.len(), 18);
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
        assert_eq!(done["resolution"]["agent"], agent_id());
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
            let cmd_path = reado_dir.join("preview-cmd.json");
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
                std::fs::write(reado_dir.join("preview-result.json"), out.to_string()).unwrap();
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
            let cmd_path = reado_dir.join("preview-cmd.json");
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
                std::fs::write(reado_dir.join("preview-result.json"), out.to_string()).unwrap();
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
            let cmd_path = reado_dir.join("preview-cmd.json");
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
                std::fs::write(reado_dir.join("preview-result.json"), out.to_string()).unwrap();
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

    #[test]
    fn unknown_resource_is_invalid_params() {
        let err = read_resource("/nope", "reado://mystery").unwrap_err();
        assert_eq!(err.0, -32602);
    }
}
