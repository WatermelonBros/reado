//! Guided Pair Review over MCP: the session verbs, typed. The CLI carries the
//! same ones for agents without MCP, but a route is an array of objects and a
//! TUI prompt is a line of text — this is the channel where it survives.

use reado_core as core;

use super::{internal, Args, RpcError};
use crate::ops::{self, agent_id, parse_comment_type};

/// The session a review tool acts on: the `sessionId` given, or the newest one
/// still open. An agent that has just been handed a session id passes it; one
/// resuming after a compaction should still land on the right session rather
/// than failing on a missing argument.
fn resolve_session(root: &str, a: Args) -> Result<core::Session, RpcError> {
    let id = a.str("sessionId");
    if !id.is_empty() {
        return core::get_session(root, &id).map_err(|e| (-32602, e.to_string()));
    }
    core::list_sessions(root)
        .into_iter()
        .find(|s| s.status != core::SessionStatus::Done)
        .ok_or((
            -32602,
            "no open guided-review session — ask the user to start one in Reado".into(),
        ))
}

/// The `route` argument as route entries, with the field names named in the
/// error so a mis-shaped array is fixable without guessing.
fn route_arg(a: Args) -> Result<Vec<core::RouteEntry>, RpcError> {
    let raw = a
        .get("route")
        .cloned()
        .ok_or((-32602, "missing `route`".to_string()))?;
    serde_json::from_value(raw).map_err(|e| {
        (
            -32602,
            format!("invalid route: {e} — expected an array of {{file, priority, reason, suggestedReviewMode, relatedFiles}}"),
        )
    })
}

pub(super) fn session_show(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    serde_json::to_string_pretty(&s).map_err(internal)
}

pub(super) fn review_context(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    serde_json::to_string_pretty(&ops::review_context(&s, &a.str("file"))).map_err(internal)
}

pub(super) fn review_plan(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    let route = route_arg(a)?;
    let planned = core::set_route(root, &s.id, route).map_err(internal)?;
    let uncovered = core::uncovered_files(&planned);
    serde_json::to_string_pretty(&serde_json::json!({
        "sessionId": planned.id,
        "routed": planned.route.len(),
        "uncovered": uncovered,
        "note": if uncovered.is_empty() {
            "Route set. Review the files in order."
        } else {
            "Route set, but these files are in the scope and not in your route. Propose a route change that includes them, or mark each out of scope with session_show's file states — leaving them out in silence is not an answer."
        },
    }))
    .map_err(internal)
}

pub(super) fn review_propose_route_change(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    let route = route_arg(a)?;
    let reason = a.str("reason");
    if reason.trim().is_empty() {
        return Err((
            -32602,
            "a route change needs a reason — it is what the human reads to decide".into(),
        ));
    }
    let updated = core::propose_route_change(root, &s.id, route, reason, "agent", Some(agent_id()))
        .map_err(internal)?;
    Ok(format!(
        "Proposed a {}-file route change on session {}. The current route is unchanged until the human accepts it in Reado — carry on with the file you were reviewing.",
        updated.route_change.as_ref().map_or(0, |c| c.route.len()),
        updated.id
    ))
}

pub(super) fn review_propose_comment(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    let line = (a.num("line") as u32).max(1);
    let end = a.num("end") as u32;
    let p = core::add_proposal(
        root,
        &s.id,
        core::NewProposal {
            artifact_type: core::ArtifactType::Comment,
            file: a.str("file"),
            start_line: line,
            end_line: if end >= line { end } else { line },
            comment_type: Some(parse_comment_type(&a.str("type"))),
            body: a.str("body"),
        },
        "agent",
        Some(agent_id()),
    )
    .map_err(internal)?;
    Ok(format!(
        "Proposed {} on {}:{} — awaiting the human's decision.",
        p.id, p.file, p.start_line
    ))
}

pub(super) fn review_propose(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    let artifact_type = match a.str("kind").as_str() {
        "follow-up" | "follow_up" => core::ArtifactType::FollowUp,
        "needs-context" | "needs_context" => core::ArtifactType::NeedsContext,
        _ => core::ArtifactType::Question,
    };
    let line = a.num("line") as u32;
    let p = core::add_proposal(
        root,
        &s.id,
        core::NewProposal {
            artifact_type,
            file: a.str("file"),
            start_line: line,
            end_line: line,
            comment_type: None,
            body: a.str("body"),
        },
        "agent",
        Some(agent_id()),
    )
    .map_err(internal)?;
    Ok(format!("Proposed {} ({:?}).", p.id, p.artifact_type))
}

pub(super) fn review_summarize_file(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    core::set_file_summary(root, &s.id, &a.str("file"), a.str("text")).map_err(internal)?;
    Ok(format!("Summary recorded for {}.", a.str("file")))
}

pub(super) fn session_summarize(root: &str, a: Args) -> Result<String, RpcError> {
    let s = resolve_session(root, a)?;
    core::set_session_summary(root, &s.id, a.str("text")).map_err(internal)?;
    Ok("Session summary recorded.".to_string())
}
