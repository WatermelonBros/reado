//! `reado comment` — add, reply to and search comments.

use clap::Subcommand;
use reado_core as core;
use reado_core::{CommentKind, NewComment, Scope};

use crate::print::{print_task_line, report};
use crate::{ops, Cli};

#[derive(Subcommand)]
pub(crate) enum CommentCmd {
    /// Add a comment anchored to a file/line (e.g. to flag another agent's work).
    Add {
        #[arg(long)]
        file: String,
        #[arg(long)]
        line: u32,
        #[arg(long)]
        end: Option<u32>,
        #[arg(long = "type", default_value = "note", value_parser = ops::COMMENT_TYPES)]
        comment_type: String,
        /// Create a note instead of a task (a task is sent to the AI batch).
        #[arg(long)]
        note: bool,
        /// The comment body (Markdown).
        body: String,
    },
    /// Reply in a comment's thread.
    Reply { id: String, body: String },
    /// Search comments by text.
    Search { query: String },
}

pub(crate) fn run(
    cli: &Cli,
    root: &str,
    agent: &str,
    action: &CommentCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        CommentCmd::Add {
            file,
            line,
            end,
            comment_type,
            note,
            body,
        } => {
            let input = NewComment {
                file: file.clone(),
                scope: Scope::Range,
                start_line: *line,
                end_line: end.unwrap_or(*line),
                comment_type: ops::parse_comment_type(comment_type),
                kind: if *note {
                    CommentKind::Note
                } else {
                    CommentKind::Task
                },
                body: body.clone(),
                context: Default::default(),
                url: None,
                x: None,
                y: None,
                target: None,
            };
            let res = core::create_comment(root, input, "agent", Some(agent.to_string()))?;
            report(cli, &res.comment, "added");
        }
        CommentCmd::Reply { id, body } => {
            let c = core::add_reply(root, id, "agent", Some(agent.to_string()), body.clone())?;
            report(cli, &c, "replied");
        }
        CommentCmd::Search { query } => {
            let hits = core::search_comments(root, query);
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&hits)?);
            } else if hits.is_empty() {
                println!("No matches.");
            } else {
                for c in &hits {
                    print_task_line(c);
                }
            }
        }
    }
    Ok(())
}
