//! `reado review` — the agent's review verbs: plan a route, advance, and
//! propose artifacts.

use clap::Subcommand;
use reado_core as core;
use reado_core::{ArtifactType, CommentKind, NewProposal};

use super::session::progress;
use crate::print::{emit, emit_proposal};
use crate::{ops, Cli};

#[derive(Subcommand)]
pub(crate) enum ReviewCmd {
    /// Set the ranked route from a JSON array of
    /// `{file, priority, reason, suggestedReviewMode, relatedFiles}`.
    /// Pass `-` to read it from stdin, or `@<path>` from a file.
    Plan {
        id: String,
        #[arg(long)]
        route: String,
    },
    /// Advance to the next unfinished file and print it (or "done").
    Next { id: String },
    /// Print the agent's context for a file: route entry, state, summary, proposals.
    Context {
        id: String,
        #[arg(long)]
        file: String,
    },
    /// Propose an anchored comment on a line (never auto-final; the human disposes).
    ProposeComment {
        id: String,
        #[arg(long)]
        file: String,
        #[arg(long)]
        line: u32,
        #[arg(long)]
        end: Option<u32>,
        #[arg(long = "type", default_value = "note", value_parser = ops::COMMENT_TYPES)]
        comment_type: String,
        body: String,
    },
    /// Propose a non-comment artifact (question / follow-up / needs-context).
    Propose {
        id: String,
        #[arg(long, value_enum)]
        kind: ProposeKindArg,
        #[arg(long, default_value = "")]
        file: String,
        #[arg(long, default_value_t = 0)]
        line: u32,
        body: String,
    },
    /// Propose a different route mid-session. The current route keeps running
    /// until the human accepts the proposal in Reado. Same `-`/`@<path>` forms
    /// as `plan`.
    ProposeRouteChange {
        id: String,
        #[arg(long)]
        route: String,
        /// Why the route should change — the human reads this to decide.
        #[arg(long)]
        reason: String,
    },
    /// Capture a file's mini-summary on completion.
    SummarizeFile {
        id: String,
        #[arg(long)]
        file: String,
        text: String,
    },
    /// Accept a proposal: materialise a durable comment (task by default, or note).
    Accept {
        id: String,
        proposal: String,
        /// Materialise as a note instead of a task.
        #[arg(long)]
        note: bool,
    },
    /// Discard a proposal (kept as session memory).
    Discard { id: String, proposal: String },
}

#[derive(Clone, Copy, clap::ValueEnum)]
pub(crate) enum ProposeKindArg {
    Question,
    Followup,
    NeedsContext,
}

impl From<ProposeKindArg> for ArtifactType {
    fn from(k: ProposeKindArg) -> Self {
        match k {
            ProposeKindArg::Question => ArtifactType::Question,
            ProposeKindArg::Followup => ArtifactType::FollowUp,
            ProposeKindArg::NeedsContext => ArtifactType::NeedsContext,
        }
    }
}

/// What to tell an agent whose route left expected files out. Not an error: the
/// route stands, and declaring a file out of scope is a valid answer — silence
/// is not.
fn uncovered_hint(id: &str, missing: &[String]) -> String {
    format!(
        "NOT COVERED ({}): {} — add them with `reado review propose-route-change {id} --route '<json>' --reason \"<why>\"`, or mark each out of scope with `reado session set-file {id} --file <path> --state out-of-scope`",
        missing.len(),
        missing.join(", "),
    )
}

/// Read a route JSON from an argument, from stdin (`-`) or from a file
/// (`@path`). A route is structured data passing through a shell: one apostrophe
/// in a `reason` is enough to mangle an inline argument, and the agent cannot see
/// that it happened. The indirect forms give it a way around its own quoting.
fn parse_route(arg: &str) -> Result<Vec<core::RouteEntry>, Box<dyn std::error::Error>> {
    let text = match arg {
        "-" => {
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut std::io::stdin(), &mut buf)?;
            buf
        }
        a => match a.strip_prefix('@') {
            Some(path) => std::fs::read_to_string(path)
                .map_err(|e| format!("cannot read route file {path}: {e}"))?,
            None => a.to_string(),
        },
    };
    Ok(serde_json::from_str(&text).map_err(|e| {
        format!("invalid route JSON: {e} — expected an array of {{file, priority, reason, suggestedReviewMode, relatedFiles}}")
    })?)
}

/// The agent's review verbs: plan a route, advance, and propose artifacts.
pub(crate) fn run(
    cli: &Cli,
    root: &str,
    agent: &str,
    action: &ReviewCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ReviewCmd::Plan { id, route } => {
            let s = core::set_route(root, id, parse_route(route)?)?;
            // The agent learns it missed a file from the answer to its own call —
            // a gap only the human sees arrives too late to be acted on. Named
            // explicitly rather than left to be re-derived from the session.
            let missing = core::uncovered_files(&s);
            if cli.json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "session": s,
                        "uncovered": missing,
                    }))?
                );
            } else {
                println!("route set: {} files", s.route.len());
                if !missing.is_empty() {
                    println!("{}", uncovered_hint(&s.id, &missing));
                }
            }
        }
        ReviewCmd::ProposeRouteChange { id, route, reason } => {
            let s = core::propose_route_change(
                root,
                id,
                parse_route(route)?,
                reason.clone(),
                "agent",
                Some(agent.to_string()),
            )?;
            emit(cli, &s, || {
                println!(
                    "route change proposed ({} files) — waiting for the human to accept it in Reado",
                    s.route_change.as_ref().map_or(0, |c| c.route.len())
                )
            })?;
        }
        ReviewCmd::Next { id } => {
            let s = core::advance(root, id)?;
            // Compute progress once (it's an O(route×files) scan), and report no
            // `entry` when finished so a consumer doesn't render the last file as
            // if it were the next one to review.
            let (rev, tot) = progress(&s);
            let all_done = rev == tot && !s.route.is_empty();
            let entry = if all_done {
                None
            } else {
                s.route.get(s.position)
            };
            if cli.json {
                let v = serde_json::json!({
                    "done": all_done,
                    "position": s.position,
                    "total": s.route.len(),
                    "entry": entry,
                });
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else if all_done {
                println!("done — every file reviewed");
            } else if let Some(e) = entry {
                println!("→ {} ({:?})  {}", e.file, e.suggested_review_mode, e.reason);
            } else {
                println!("no route yet — run `reado review plan`");
            }
        }
        ReviewCmd::Context { id, file } => {
            let s = core::get_session(root, id)?;
            let entry = s.route.iter().find(|e| &e.file == file);
            let proposals = s.proposals.iter().filter(|p| &p.file == file).count();
            if cli.json {
                let v = ops::review_context(&s, file);
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else {
                println!("{file}");
                if let Some(e) = entry {
                    println!("  reason: {}", e.reason);
                    if !e.related_files.is_empty() {
                        println!("  related: {}", e.related_files.join(", "));
                    }
                }
                println!("  proposals: {proposals}");
            }
        }
        ReviewCmd::ProposeComment {
            id,
            file,
            line,
            end,
            comment_type,
            body,
        } => {
            let p = core::add_proposal(
                root,
                id,
                NewProposal {
                    artifact_type: ArtifactType::Comment,
                    file: file.clone(),
                    start_line: *line,
                    end_line: end.unwrap_or(*line),
                    comment_type: Some(ops::parse_comment_type(comment_type)),
                    body: body.clone(),
                },
                "agent",
                Some(agent.to_string()),
            )?;
            emit_proposal(cli, &p)?;
        }
        ReviewCmd::Propose {
            id,
            kind,
            file,
            line,
            body,
        } => {
            let p = core::add_proposal(
                root,
                id,
                NewProposal {
                    artifact_type: (*kind).into(),
                    file: file.clone(),
                    start_line: *line,
                    end_line: *line,
                    comment_type: None,
                    body: body.clone(),
                },
                "agent",
                Some(agent.to_string()),
            )?;
            emit_proposal(cli, &p)?;
        }
        ReviewCmd::SummarizeFile { id, file, text } => {
            let s = core::set_file_summary(root, id, file, text.clone())?;
            emit(cli, &s, || println!("summary saved for {file}"))?;
        }
        ReviewCmd::Accept { id, proposal, note } => {
            let kind = if *note {
                CommentKind::Note
            } else {
                CommentKind::Task
            };
            let s = core::accept_proposal(root, id, proposal, kind)?;
            emit(cli, &s, || println!("accepted {proposal}"))?;
        }
        ReviewCmd::Discard { id, proposal } => {
            let s =
                core::set_proposal_state(root, id, proposal, core::ArtifactState::Discarded, None)?;
            emit(cli, &s, || println!("discarded {proposal}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_route_reads_from_an_argument_or_a_file() {
        let json = r#"[{"file":"a.rs","priority":1,"reason":"it's the caller","suggestedReviewMode":"deep"}]"#;
        let inline = parse_route(json).unwrap();
        assert_eq!(inline[0].file, "a.rs");
        assert_eq!(inline[0].suggested_review_mode, core::ReviewMode::Deep);

        // The same route through a file — the way out of a shell's quoting for an
        // agent that has no MCP (the reason above contains an apostrophe).
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("route.json");
        std::fs::write(&path, json).unwrap();
        let from_file = parse_route(&format!("@{}", path.display())).unwrap();
        assert_eq!(from_file[0].reason, "it's the caller");
    }

    #[test]
    fn a_bad_route_names_the_fields_it_wanted() {
        let err = parse_route("[\"a.rs\"]").unwrap_err().to_string();
        assert!(err.contains("suggestedReviewMode"), "got: {err}");
        let missing = parse_route("@/nope/route.json").unwrap_err().to_string();
        assert!(missing.contains("cannot read route file"), "got: {missing}");
    }

    #[test]
    fn the_coverage_hint_offers_both_answers() {
        // Route them, or say why not — the hint has to name a verb for each, or
        // an agent that missed a file has nowhere to go.
        let hint = uncovered_hint("s_1", &["a.rs".into(), "b.rs".into()]);
        assert!(hint.contains("NOT COVERED (2): a.rs, b.rs"), "got: {hint}");
        assert!(hint.contains("propose-route-change"));
        assert!(hint.contains("out-of-scope"));
    }
}
