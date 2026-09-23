//! `reado task` — list, show and resolve tasks.

use clap::Subcommand;
use reado_core as core;
use reado_core::{Comment, CommentKind, CommentState};

use crate::print::{print_task_full, print_task_line, report};
use crate::{ops, Cli};

#[derive(Subcommand)]
pub(crate) enum TaskCmd {
    /// List open tasks awaiting resolution.
    List,
    /// Show a task and its full thread.
    Show { id: String },
    /// Mark a task done, recording how it was resolved. With `--verify` the
    /// command decides: a passing check archives it as done, anything else
    /// leaves it resolved-but-unverified for a human to look at.
    Done {
        id: String,
        /// The git ref or range that resolved it (e.g. `HEAD~1..HEAD`).
        #[arg(long)]
        diff: Option<String>,
        /// Capture the current working diff's ref instead of naming one.
        #[arg(long)]
        capture: bool,
        /// A command that proves the fix (run in the project root).
        #[arg(long)]
        verify: Option<String>,
        /// The model that did the work (defaults to $READO_MODEL).
        #[arg(long)]
        model: Option<String>,
    },
    /// Record a failed attempt and return the task to open with a note. Past the
    /// attempt budget the task blocks itself.
    Fail { id: String, note: Option<String> },
    /// Block a task: you cannot proceed without a human answering first.
    Block { id: String, reason: String },
    /// Answer a blocked task: add context and return it to the resolvable set.
    Answer { id: String, note: String },
    /// Link a task to another comment (for the knowledge graph).
    Link { id: String, target: String },
}

pub(crate) fn run(
    cli: &Cli,
    root: &str,
    _agent: &str,
    action: &TaskCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        TaskCmd::List => {
            // Blocked tasks are deliberately absent: this list is the resolvable
            // set an agent works from, and a blocked task is waiting on a human.
            // `reado task show` still reads one by id.
            let tasks: Vec<Comment> = core::list_comments(root)
                .into_iter()
                .filter(|c| {
                    c.meta.kind == CommentKind::Task
                        && c.meta.state != CommentState::Done
                        && c.meta.state != CommentState::Blocked
                })
                .collect();
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&tasks)?);
            } else if tasks.is_empty() {
                println!("No open tasks.");
            } else {
                for t in &tasks {
                    print_task_line(t);
                }
            }
        }
        TaskCmd::Show { id } => {
            let c = core::get_comment(root, id)?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&c)?);
            } else {
                print_task_full(&c);
            }
        }
        TaskCmd::Done {
            id,
            diff,
            capture,
            verify,
            model,
        } => {
            let diff_ref = match diff {
                Some(d) => Some(d.clone()),
                // `--capture` names what is on disk right now. HEAD is the honest
                // ref for "the working tree as it differs from the last commit".
                None if *capture => Some(current_head(root).unwrap_or_else(|| "HEAD".into())),
                None => None,
            };
            let c = ops::resolve_task(
                root,
                id,
                _agent.to_string(),
                model.clone(),
                diff_ref,
                verify.clone(),
            )?;
            let verb = if c.meta.state == CommentState::Done {
                "done (verified)"
            } else {
                "resolved (unverified — needs a human)"
            };
            report(cli, &c, verb);
        }
        TaskCmd::Fail { id, note } => {
            if let Some(note) = note {
                core::add_reply(root, id, "agent", Some(_agent.to_string()), note.clone())?;
            }
            let c = core::fail_attempt(root, id)?;
            let outcome = if c.meta.state == CommentState::Blocked {
                "failed (blocked — needs a human)"
            } else {
                "failed (returned to open)"
            };
            report(cli, &c, outcome);
        }
        TaskCmd::Block { id, reason } => {
            let c = core::block_comment(root, id, reason)?;
            report(cli, &c, "blocked");
        }
        TaskCmd::Answer { id, note } => {
            let c = core::answer_blocked(root, id, "human", note)?;
            report(cli, &c, "answered (returned to open)");
        }
        TaskCmd::Link { id, target } => {
            let c = core::link_comments(root, id, target)?;
            report(cli, &c, "linked");
        }
    }
    Ok(())
}

/// The current commit, for `--capture`. `None` outside a repository.
fn current_head(root: &str) -> Option<String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let head = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!head.is_empty()).then_some(head)
}
