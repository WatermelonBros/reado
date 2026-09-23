//! The verbs the CLI and the MCP server both implement, in one place so the two
//! front ends cannot drift apart: a task resolved over MCP and one resolved from
//! a shell read the same.

use reado_core::{self as core, Comment, CommentType, Session};

/// The agent identity mutations are attributed to: `$READO_AGENT`, or "agent"
/// when it is unset or empty.
pub fn agent_id() -> String {
    std::env::var("READO_AGENT")
        .ok()
        .filter(|a| !a.is_empty())
        .unwrap_or_else(|| "agent".to_string())
}

/// Every comment type by name, as the CLI accepts them.
pub const COMMENT_TYPES: [&str; 5] = ["bug", "refactor", "performance", "question", "note"];

/// A comment type by name, defaulting to `note` for anything unrecognised —
/// an agent's typo should not fail the write.
pub fn parse_comment_type(name: &str) -> CommentType {
    match name {
        "bug" => CommentType::Bug,
        "refactor" => CommentType::Refactor,
        "performance" => CommentType::Performance,
        "question" => CommentType::Question,
        _ => CommentType::Note,
    }
}

/// Run the verification command in the project root and report whether it
/// succeeded. A command that cannot even start counts as failed — an unrunnable
/// check has proved nothing.
pub fn run_verify(root: &str, cmd: &str) -> bool {
    let mut command = if cfg!(windows) {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", cmd]);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", cmd]);
        c
    };
    command
        .current_dir(root)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Resolve task `id` with its provenance: `verify` is run (and decides between
/// done and resolved-unverified), and the model falls back to `$READO_MODEL`.
pub fn resolve_task(
    root: &str,
    id: &str,
    agent: String,
    model: Option<String>,
    diff_ref: Option<String>,
    verify: Option<String>,
) -> core::Result<Comment> {
    let verify = verify.map(|cmd| core::Verification {
        passed: run_verify(root, &cmd),
        cmd,
    });
    let model = model
        .filter(|m| !m.is_empty())
        .or_else(|| std::env::var("READO_MODEL").ok().filter(|m| !m.is_empty()));
    core::resolve_comment(
        root,
        id,
        core::Resolution {
            agent,
            model,
            diff_ref,
            verify,
            at: core::now_millis(),
        },
    )
}

/// One file's context inside a session: its route entry (why it was ranked,
/// related files), its state, its running summary, the proposals already on it,
/// and the objective that shapes the review.
pub fn review_context(s: &Session, file: &str) -> serde_json::Value {
    let fstate = s.files.iter().find(|f| f.file == file);
    let proposals: Vec<_> = s.proposals.iter().filter(|p| p.file == file).collect();
    serde_json::json!({
        "sessionId": s.id,
        "file": file,
        "objective": s.objective,
        "entry": s.route.iter().find(|e| e.file == file),
        "state": fstate.map(|f| f.state),
        "summary": fstate.and_then(|f| f.summary.clone()),
        "proposals": proposals,
    })
}
