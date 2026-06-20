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
use reado_core::{Comment, CommentKind, CommentState, CommentType, NewComment, Scope};

#[derive(Parser)]
#[command(name = "reado", version, about = "Read and resolve Reado tasks.")]
struct Cli {
    /// Project root (defaults to the nearest ancestor with a .reado/ or .git/).
    #[arg(long, global = true)]
    root: Option<String>,
    /// Agent identity to attribute writes to (defaults to $READO_AGENT).
    #[arg(long, global = true)]
    agent: Option<String>,
    /// Emit JSON instead of human-readable text.
    #[arg(long, global = true)]
    json: bool,
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
}

#[derive(Subcommand)]
enum KbCmd {
    /// List the knowledge sources: docs, specs, and the notes (comments) count.
    List,
    /// Print a knowledge document (a doc or spec markdown file) by path.
    Show { path: String },
    /// Full-text search the docs and specs by content.
    Search { query: String },
}

#[derive(Subcommand)]
enum TaskCmd {
    /// List open tasks awaiting resolution.
    List,
    /// Show a task and its full thread.
    Show { id: String },
    /// Mark a task done (archives it as history).
    Done { id: String },
    /// Return a task to open with a note explaining why it could not be done.
    Fail { id: String, note: Option<String> },
    /// Link a task to another comment (for the knowledge graph).
    Link { id: String, target: String },
}

#[derive(Subcommand)]
enum CommentCmd {
    /// Add a comment anchored to a file/line (e.g. to flag another agent's work).
    Add {
        #[arg(long)]
        file: String,
        #[arg(long)]
        line: u32,
        #[arg(long)]
        end: Option<u32>,
        #[arg(long = "type", value_enum, default_value = "note")]
        comment_type: TypeArg,
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

#[derive(Clone, Copy, clap::ValueEnum)]
enum TypeArg {
    Bug,
    Refactor,
    Performance,
    Question,
    Note,
}

impl From<TypeArg> for CommentType {
    fn from(t: TypeArg) -> Self {
        match t {
            TypeArg::Bug => CommentType::Bug,
            TypeArg::Refactor => CommentType::Refactor,
            TypeArg::Performance => CommentType::Performance,
            TypeArg::Question => CommentType::Question,
            TypeArg::Note => CommentType::Note,
        }
    }
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
    let agent = cli
        .agent
        .clone()
        .or_else(|| std::env::var("READO_AGENT").ok())
        .unwrap_or_else(|| "agent".to_string());

    match &cli.command {
        Command::Task { action } => task(cli, &root, &agent, action)?,
        Command::Comment { action } => comment(cli, &root, &agent, action)?,
        Command::Kb { action } => kb(cli, &root, action)?,
    }
    Ok(())
}

/// The knowledge base: docs, specs and notes, so an agent can consult the plan
/// and documentation before resolving tasks.
fn kb(cli: &Cli, root: &str, action: &KbCmd) -> Result<(), Box<dyn std::error::Error>> {
    let root_path = Path::new(root);
    match action {
        KbCmd::List => {
            let mut md = Vec::new();
            collect_markdown(root_path, root_path, &mut md);
            md.sort();
            // Specs live under openspec/ or .specify/; everything else is a doc.
            let (specs, docs): (Vec<String>, Vec<String>) = md
                .into_iter()
                .partition(|p| p.contains("openspec/") || p.contains(".specify/"));
            let active = core::list_comments(root).len();
            let resolved = core::list_archived(root).len();
            if cli.json {
                let v = serde_json::json!({
                    "docs": docs,
                    "specs": specs,
                    "notes": { "active": active, "resolved": resolved },
                });
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else {
                println!("# Docs");
                for d in &docs {
                    println!("  {d}");
                }
                println!("# Specs");
                for s in &specs {
                    println!("  {s}");
                }
                println!("# Notes");
                println!(
                    "  {active} active, {resolved} resolved comments \
                     — `reado kb show <path>` to read a doc/spec, `reado comment search <q>` for notes."
                );
            }
        }
        KbCmd::Show { path } => {
            if path.contains("..") {
                return Err("path must be inside the project".into());
            }
            let text = std::fs::read_to_string(root_path.join(path))?;
            print!("{text}");
        }
        KbCmd::Search { query } => {
            let needle = query.to_lowercase();
            let mut md = Vec::new();
            collect_markdown(root_path, root_path, &mut md);
            md.sort();
            let mut hits: Vec<(String, usize, String)> = Vec::new();
            for rel in &md {
                if hits.len() >= 200 {
                    break;
                }
                let Ok(content) = std::fs::read_to_string(root_path.join(rel)) else {
                    continue;
                };
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&needle) {
                        hits.push((rel.clone(), i + 1, line.trim().to_string()));
                        if hits.len() >= 200 {
                            break;
                        }
                    }
                }
            }
            if cli.json {
                let rows: Vec<_> = hits
                    .iter()
                    .map(|(p, l, t)| serde_json::json!({ "path": p, "line": l, "text": t }))
                    .collect();
                println!("{}", serde_json::to_string_pretty(&rows)?);
            } else if hits.is_empty() {
                println!("No matches.");
            } else {
                for (p, l, t) in &hits {
                    println!("{p}:{l}: {t}");
                }
            }
        }
    }
    Ok(())
}

/// Recursively collect project-relative markdown paths, skipping VCS/build/vendor
/// directories and Reado's own comment store.
fn collect_markdown(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if matches!(
                name.as_str(),
                ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | "vendor"
                    | ".reado" | ".claude" | ".codex" | ".github" | ".vscode"
            ) {
                continue;
            }
            collect_markdown(root, &path, out);
        } else {
            let lower = name.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                if let Ok(rel) = path.strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
}

fn task(
    cli: &Cli,
    root: &str,
    _agent: &str,
    action: &TaskCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        TaskCmd::List => {
            let tasks: Vec<Comment> = core::list_comments(root)
                .into_iter()
                .filter(|c| c.meta.kind == CommentKind::Task && c.meta.state != CommentState::Done)
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
        TaskCmd::Done { id } => {
            let c = core::set_comment_state(root, id, CommentState::Done)?;
            report(cli, &c, "done");
        }
        TaskCmd::Fail { id, note } => {
            if let Some(note) = note {
                core::add_reply(root, id, "agent", Some(_agent.to_string()), note.clone())?;
            }
            let c = core::set_comment_state(root, id, CommentState::Open)?;
            report(cli, &c, "failed (returned to open)");
        }
        TaskCmd::Link { id, target } => {
            let c = core::link_comments(root, id, target)?;
            report(cli, &c, "linked");
        }
    }
    Ok(())
}

fn comment(
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
                comment_type: (*comment_type).into(),
                kind: if *note {
                    CommentKind::Note
                } else {
                    CommentKind::Task
                },
                body: body.clone(),
                context: Default::default(),
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

// ---- Output helpers ------------------------------------------------------

fn report(cli: &Cli, c: &Comment, verb: &str) {
    if cli.json {
        if let Ok(s) = serde_json::to_string_pretty(c) {
            println!("{s}");
        }
    } else {
        println!("{} {}: {verb}", glyph(c), c.meta.id);
    }
}

fn glyph(c: &Comment) -> &'static str {
    match c.meta.state {
        CommentState::Done => "✓",
        CommentState::Discarded => "—",
        _ if c.meta.orphan => "⚠",
        _ => "●",
    }
}

fn anchor_label(c: &Comment) -> String {
    match c.meta.anchor.scope {
        Scope::Range => format!("{}:{}", c.meta.anchor.file, c.meta.anchor.start_line),
        Scope::File => c.meta.anchor.file.clone(),
        Scope::Project => "(project)".to_string(),
    }
}

fn first_line(c: &Comment) -> &str {
    c.messages
        .first()
        .map(|m| m.body.lines().next().unwrap_or(""))
        .unwrap_or("")
}

fn print_task_line(c: &Comment) {
    println!(
        "{} {}  [{:?}]  {}  ({:?})",
        glyph(c),
        c.meta.id,
        c.meta.comment_type,
        anchor_label(c),
        c.meta.state
    );
    let body = first_line(c);
    if !body.is_empty() {
        println!("    {body}");
    }
}

fn print_task_full(c: &Comment) {
    print_task_line(c);
    println!();
    for m in &c.messages {
        let who = match (m.author.as_str(), m.agent.as_deref()) {
            ("agent", Some(a)) => a.to_string(),
            ("agent", None) => "agent".to_string(),
            _ => "you".to_string(),
        };
        println!("— {who}:");
        for line in m.body.lines() {
            println!("  {line}");
        }
        println!();
    }
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
        if dir.join(".reado").is_dir() || dir.join(".git").is_dir() {
            return Ok(dir.to_string_lossy().into_owned());
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    Ok(cwd.to_string_lossy().into_owned())
}
