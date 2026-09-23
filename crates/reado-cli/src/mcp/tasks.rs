//! The review loop's own verbs — resolve, fail, block, comment, reply — plus the
//! turn handoff and the mascot, so an agent can close the loop through MCP
//! instead of shelling out to the CLI. Each returns the id and the resulting
//! state, not just "ok".

use reado_core::{self as core, CommentKind};

use super::{internal, Args, RpcError};
use crate::ops::{self, agent_id, parse_comment_type};

/// A structured result for a mutating tool: what changed, and what it is now.
fn mutation_result(c: &core::Comment, action: &str) -> Result<String, RpcError> {
    serde_json::to_string_pretty(&serde_json::json!({
        "action": action,
        "id": c.meta.id,
        "state": c.meta.state,
        "attempts": c.meta.attempts,
        "blockedReason": c.meta.blocked_reason,
        "resolution": c.meta.resolution,
    }))
    .map_err(internal)
}

pub(super) fn task_done(root: &str, a: Args) -> Result<String, RpcError> {
    let given = |k: &str| Some(a.str(k)).filter(|v| !v.is_empty());
    let c = ops::resolve_task(
        root,
        &a.str("id"),
        agent_id(),
        given("model"),
        given("diffRef"),
        given("verify"),
    )
    .map_err(internal)?;
    mutation_result(&c, "task_done")
}

pub(super) fn task_fail(root: &str, a: Args) -> Result<String, RpcError> {
    let note = a.str("note");
    if !note.is_empty() {
        core::add_reply(root, &a.str("id"), "agent", Some(agent_id()), note).map_err(internal)?;
    }
    let c = core::fail_attempt(root, &a.str("id")).map_err(internal)?;
    mutation_result(&c, "task_fail")
}

pub(super) fn task_block(root: &str, a: Args) -> Result<String, RpcError> {
    let c = core::block_comment(root, &a.str("id"), &a.str("reason")).map_err(internal)?;
    mutation_result(&c, "task_block")
}

pub(super) fn comment_add(root: &str, a: Args) -> Result<String, RpcError> {
    let line = a.num("line") as u32;
    let end = a.num("end") as u32;
    // A task unless asked for a note — the same default as `reado comment
    // add`, so an agent flags an issue the same way over either channel.
    let kind = if a.str("kind") == "note" {
        CommentKind::Note
    } else {
        CommentKind::Task
    };
    let created = core::create_comment(
        root,
        core::NewComment {
            file: a.str("file"),
            scope: core::Scope::Range,
            start_line: line.max(1),
            end_line: if end >= line.max(1) { end } else { line.max(1) },
            comment_type: parse_comment_type(&a.str("type")),
            kind,
            body: a.str("body"),
            context: core::Context::default(),
            url: None,
            x: None,
            y: None,
            target: None,
        },
        "agent",
        Some(agent_id()),
    )
    .map_err(internal)?;
    mutation_result(&created.comment, "comment_add")
}

pub(super) fn comment_reply(root: &str, a: Args) -> Result<String, RpcError> {
    let c = core::add_reply(root, &a.str("id"), "agent", Some(agent_id()), a.str("body"))
        .map_err(internal)?;
    mutation_result(&c, "comment_reply")
}

pub(super) fn mascot_say(root: &str, a: Args) -> Result<String, RpcError> {
    // A refusal (empty, or too long for a bubble) comes back as the agent's own
    // error to read and act on, not as a server fault.
    let said = core::mark_mascot_say(root, &a.str("text"), &a.str("mood"))
        .map_err(|e| (-32602, e.to_string()))?;
    Ok(format!("said: {}", said.text))
}

pub(super) fn session_done(root: &str, a: Args) -> Result<String, RpcError> {
    let status = match a.str("status").as_str() {
        "blocked" => "blocked",
        "failed" => "failed",
        _ => "done",
    };
    core::mark_session_done(root, status, &a.str("summary")).map_err(internal)?;
    Ok("Noted — Reado will let the user know.".to_string())
}
