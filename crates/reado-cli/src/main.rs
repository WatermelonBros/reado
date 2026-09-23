//! The `reado` CLI — the stable contract between Reado and an AI agent.
//!
//! Reado's app launches `claude`/`codex` in a terminal and asks them to resolve
//! tasks. The agent reads and mutates those tasks **only** through this CLI, so
//! the on-disk `.reado/` format can evolve without breaking the agent loop.
//!
//! Commands (per the spec):
//!   reado task list | show <id> | done <id> | fail <id> [note] | link <id> <target>
//!   reado comment add --file F --line N [--end M] [--type T] [--note] <body>
//!   reado comment reply <id> <body>
//!   reado comment search <query>
//!
//! The project root is found by walking up from the CWD to the nearest `.reado/`
//! (or `.git/`); override with `--root`. The agent's identity comes from
//! `$READO_AGENT` (set by the Reado plugin) or `--agent`.

use std::path::Path;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use reado_core as core;

use commands::{
    comment::CommentCmd, kb::KbCmd, review::ReviewCmd, session::SessionCmd, task::TaskCmd,
};

mod commands {
    pub mod comment;
    pub mod kb;
    pub mod review;
    pub mod session;
    pub mod task;
    pub mod thought;
}
mod mcp;
mod ops;
mod print;

#[derive(Parser)]
#[command(name = "reado", version, about = "Read and resolve Reado tasks.")]
pub(crate) struct Cli {
    /// Project root (defaults to the nearest ancestor with a .reado/ or .git/).
    #[arg(long, global = true)]
    root: Option<String>,
    /// Agent identity to attribute writes to (defaults to $READO_AGENT).
    #[arg(long, global = true)]
    agent: Option<String>,
    /// Emit JSON instead of human-readable text.
    #[arg(long, global = true)]
    pub(crate) json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Work with tasks (comments flagged as task).
    Task {
        #[command(subcommand)]
        action: TaskCmd,
    },
    /// Work with comments and their threads.
    Comment {
        #[command(subcommand)]
        action: CommentCmd,
    },
    /// Browse the project's knowledge base (docs, specs, notes) — for the agent
    /// to consult the plan and documentation before resolving tasks.
    Kb {
        #[command(subcommand)]
        action: KbCmd,
    },
    /// Manage Guided Pair Review sessions (the durable, resumable review record).
    Session {
        #[command(subcommand)]
        action: SessionCmd,
    },
    /// Drive a guided review: plan a route, advance, and propose artifacts. This
    /// is the agent's side of the contract — it never edits the UI, only emits
    /// structured proposals the human disposes of.
    Review {
        #[command(subcommand)]
        action: ReviewCmd,
    },
    /// Narrate one line of reasoning for the human watching in Reado — a
    /// non-obvious decision, an ordering, or an assumption you're relying on.
    /// Appended to `.reado/reasoning.jsonl`; Reado's reasoning panel tails it live.
    Thought {
        /// The reasoning, in one human sentence — the "why", not the "what".
        text: String,
        /// A tag for styling: note | decision | assumption | plan.
        #[arg(long, default_value = "note")]
        kind: String,
    },
    /// Run a Model Context Protocol server (stdio) exposing the project's
    /// comments, tasks, reading progress, and bookmarks as read-only resources.
    Mcp,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(&cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("reado: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let root = resolve_root(cli.root.as_deref())?;
    let agent = cli.agent.clone().unwrap_or_else(ops::agent_id);

    match &cli.command {
        Command::Task { action } => commands::task::run(cli, &root, &agent, action)?,
        Command::Comment { action } => commands::comment::run(cli, &root, &agent, action)?,
        Command::Kb { action } => commands::kb::run(cli, &root, action)?,
        Command::Session { action } => commands::session::run(cli, &root, &agent, action)?,
        Command::Review { action } => commands::review::run(cli, &root, &agent, action)?,
        Command::Thought { text, kind } => commands::thought::run(&root, &agent, text, kind)?,
        Command::Mcp => mcp::serve(&root)?,
    }
    Ok(())
}

/// Walk up from `start` (or CWD) to the nearest dir containing `.reado/` or
/// `.git/`; fall back to the CWD.
fn resolve_root(explicit: Option<&str>) -> Result<String, Box<dyn std::error::Error>> {
    if let Some(r) = explicit {
        return Ok(r.to_string());
    }
    let cwd = std::env::current_dir()?;
    let mut dir: &Path = &cwd;
    loop {
        if dir.join(core::READO_DIR).is_dir() || dir.join(".git").is_dir() {
            return Ok(dir.to_string_lossy().into_owned());
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    Ok(cwd.to_string_lossy().into_owned())
}
