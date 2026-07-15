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
use reado_core::{
    ArtifactType, Comment, CommentKind, CommentState, CommentType, FileState, NewComment,
    NewProposal, NewSession, Objective, ReviewScope, Scope, ScopeKind,
};

mod mcp;

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

#[derive(Subcommand)]
enum SessionCmd {
    /// Start a session for a scope (creates the persistent record).
    Create {
        /// What the review covers.
        #[arg(long, value_enum)]
        scope: ScopeArg,
        /// Base branch for a `branch` scope (e.g. main).
        #[arg(long)]
        base: Option<String>,
        /// Path(s) for a `folder`/`files` scope; repeatable.
        #[arg(long = "path")]
        paths: Vec<String>,
        /// Optional review objective that shapes the LLM's focus.
        #[arg(long, value_enum)]
        objective: Option<ObjectiveArg>,
        /// A short title (defaults from the scope).
        #[arg(long)]
        title: Option<String>,
    },
    /// List sessions, newest first.
    List,
    /// Show a session in full (route, files, proposals, summaries).
    Show { id: String },
    /// Print a compact progress line (reviewed / remaining) for a session.
    Status { id: String },
    /// Set a file's review state.
    SetFile {
        id: String,
        #[arg(long)]
        file: String,
        #[arg(long, value_enum)]
        state: FileStateArg,
    },
    /// Record a session decision (kept as session memory, distinct from a comment).
    Decision {
        id: String,
        #[arg(long, default_value = "")]
        file: String,
        text: String,
    },
    /// Capture a summary — the file's mini-summary with --file, else the session recap.
    Summarize {
        id: String,
        #[arg(long)]
        file: Option<String>,
        text: String,
    },
    /// Close a session (marks it done; the record stays for resume/history).
    Close { id: String },
}

#[derive(Subcommand)]
enum ReviewCmd {
    /// Set the ranked route from a JSON array of
    /// `{file, priority, reason, suggestedReviewMode, relatedFiles}`.
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
        #[arg(long = "type", value_enum, default_value = "note")]
        comment_type: TypeArg,
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
    /// Replace the route mid-session (a proposed route change the human accepted).
    ProposeRouteChange {
        id: String,
        #[arg(long)]
        route: String,
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
enum ScopeArg {
    Diff,
    Branch,
    Folder,
    Files,
    Comments,
    Project,
    Pr,
}

impl From<ScopeArg> for ScopeKind {
    fn from(s: ScopeArg) -> Self {
        match s {
            ScopeArg::Diff => ScopeKind::Diff,
            ScopeArg::Branch => ScopeKind::Branch,
            ScopeArg::Folder => ScopeKind::Folder,
            ScopeArg::Files => ScopeKind::Files,
            ScopeArg::Comments => ScopeKind::Comments,
            ScopeArg::Project => ScopeKind::Project,
            ScopeArg::Pr => ScopeKind::Pr,
        }
    }
}

#[derive(Clone, Copy, clap::ValueEnum)]
enum ObjectiveArg {
    BugRisk,
    Design,
    Maintainability,
    Security,
    Performance,
    TestCoverage,
    AiSanity,
    Onboarding,
    General,
}

impl From<ObjectiveArg> for Objective {
    fn from(o: ObjectiveArg) -> Self {
        match o {
            ObjectiveArg::BugRisk => Objective::BugRisk,
            ObjectiveArg::Design => Objective::Design,
            ObjectiveArg::Maintainability => Objective::Maintainability,
            ObjectiveArg::Security => Objective::Security,
            ObjectiveArg::Performance => Objective::Performance,
            ObjectiveArg::TestCoverage => Objective::TestCoverage,
            ObjectiveArg::AiSanity => Objective::AiSanity,
            ObjectiveArg::Onboarding => Objective::Onboarding,
            ObjectiveArg::General => Objective::General,
        }
    }
}

#[derive(Clone, Copy, clap::ValueEnum)]
enum FileStateArg {
    NotStarted,
    Queued,
    InReview,
    Reviewed,
    NeedsFollowup,
    Skipped,
    Blocked,
    OutOfScope,
}

impl From<FileStateArg> for FileState {
    fn from(s: FileStateArg) -> Self {
        match s {
            FileStateArg::NotStarted => FileState::NotStarted,
            FileStateArg::Queued => FileState::Queued,
            FileStateArg::InReview => FileState::InReview,
            FileStateArg::Reviewed => FileState::Reviewed,
            FileStateArg::NeedsFollowup => FileState::NeedsFollowup,
            FileStateArg::Skipped => FileState::Skipped,
            FileStateArg::Blocked => FileState::Blocked,
            FileStateArg::OutOfScope => FileState::OutOfScope,
        }
    }
}

#[derive(Clone, Copy, clap::ValueEnum)]
enum ProposeKindArg {
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
        Command::Session { action } => session(cli, &root, &agent, action)?,
        Command::Review { action } => review(cli, &root, &agent, action)?,
        Command::Thought { text, kind } => thought(&root, &agent, text, kind)?,
        Command::Mcp => mcp::serve(&root)?,
    }
    Ok(())
}

/// Append one reasoning line to `.reado/reasoning.jsonl` (creating `.reado/` if
/// needed). The agent's live narration channel: Reado's watcher sees the write,
/// emits `reasoning-changed`, and the reasoning panel re-reads the file.
fn thought(
    root: &str,
    agent: &str,
    text: &str,
    kind: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Write;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let line = serde_json::json!({ "ts": ts, "kind": kind, "text": text, "agent": agent });
    let dir = std::path::Path::new(root).join(".reado");
    std::fs::create_dir_all(&dir)?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("reasoning.jsonl"))?;
    writeln!(f, "{}", serde_json::to_string(&line)?)?;
    Ok(())
}

/// Guided Pair Review sessions: the durable record the agent and human share.
fn session(
    cli: &Cli,
    root: &str,
    agent: &str,
    action: &SessionCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        SessionCmd::Create {
            scope,
            base,
            paths,
            objective,
            title,
        } => {
            let kind: ScopeKind = (*scope).into();
            let title = title.clone().unwrap_or_else(|| default_title(kind, paths));
            let input = NewSession {
                title,
                scope: ReviewScope {
                    kind,
                    base: base.clone(),
                    paths: paths.clone(),
                    pr: None,
                    request: None,
                },
                objective: objective.map(|o| o.into()),
            };
            let s = core::create_session(root, input, Some(agent.to_string()))?;
            emit(cli, &s, || {
                println!("session {} created: {}", s.id, s.title)
            })?;
        }
        SessionCmd::List => {
            let sessions = core::list_sessions(root);
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&sessions)?);
            } else if sessions.is_empty() {
                println!("No review sessions.");
            } else {
                for s in &sessions {
                    println!("{}  {:?}  {}", s.id, s.status, s.title);
                }
            }
        }
        SessionCmd::Show { id } => {
            let s = core::get_session(root, id)?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&s)?);
            } else {
                print_session(&s);
            }
        }
        SessionCmd::Status { id } => {
            let s = core::get_session(root, id)?;
            let (reviewed, total) = progress(&s);
            if cli.json {
                let v = serde_json::json!({
                    "id": s.id, "status": s.status, "reviewed": reviewed, "total": total,
                    "position": s.position, "proposals": s.proposals.len(),
                });
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else {
                println!("{:?} — {reviewed}/{total} files reviewed", s.status);
            }
        }
        SessionCmd::SetFile { id, file, state } => {
            let new_state: FileState = (*state).into();
            let s = core::set_file_state(root, id, file, new_state)?;
            emit(cli, &s, || println!("{file}: {new_state:?}"))?;
        }
        SessionCmd::Decision { id, file, text } => {
            let p = core::add_decision(root, id, text.clone(), file)?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&p)?);
            } else {
                println!("decision recorded: {}", p.id);
            }
        }
        SessionCmd::Summarize { id, file, text } => {
            let s = match file {
                Some(f) => core::set_file_summary(root, id, f, text.clone())?,
                None => core::set_session_summary(root, id, text.clone())?,
            };
            emit(cli, &s, || println!("summary saved"))?;
        }
        SessionCmd::Close { id } => {
            let s = core::close_session(root, id)?;
            emit(cli, &s, || println!("session {} closed", s.id))?;
        }
    }
    Ok(())
}

/// The agent's review verbs: plan a route, advance, and propose artifacts.
fn review(
    cli: &Cli,
    root: &str,
    agent: &str,
    action: &ReviewCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ReviewCmd::Plan { id, route } | ReviewCmd::ProposeRouteChange { id, route } => {
            let route = serde_json::from_str(route)
                .map_err(|e| format!("invalid route JSON: {e} — expected an array of {{file, priority, reason, suggestedReviewMode, relatedFiles}}"))?;
            let s = core::set_route(root, id, route)?;
            emit(cli, &s, || println!("route set: {} files", s.route.len()))?;
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
            let fstate = s.files.iter().find(|f| &f.file == file);
            let proposals: Vec<_> = s.proposals.iter().filter(|p| &p.file == file).collect();
            if cli.json {
                let v = serde_json::json!({
                    "file": file,
                    "entry": entry,
                    "state": fstate.map(|f| f.state),
                    "summary": fstate.and_then(|f| f.summary.clone()),
                    "proposals": proposals,
                });
                println!("{}", serde_json::to_string_pretty(&v)?);
            } else {
                println!("{file}");
                if let Some(e) = entry {
                    println!("  reason: {}", e.reason);
                    if !e.related_files.is_empty() {
                        println!("  related: {}", e.related_files.join(", "));
                    }
                }
                println!("  proposals: {}", proposals.len());
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
                    comment_type: Some((*comment_type).into()),
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

fn default_title(kind: ScopeKind, paths: &[String]) -> String {
    match kind {
        ScopeKind::Diff => "Review the current diff".into(),
        ScopeKind::Branch => "Review this branch".into(),
        ScopeKind::Folder => format!(
            "Review {}",
            paths.first().map(String::as_str).unwrap_or(".")
        ),
        ScopeKind::Files => "Review selected files".into(),
        ScopeKind::Comments => "Review open comments".into(),
        ScopeKind::Project => "Review the project".into(),
        ScopeKind::Pr => "Review the pull request".into(),
        ScopeKind::Prompt => "Review as requested".into(),
    }
}

/// Reviewed-or-otherwise-finished files over total routed files.
fn progress(s: &core::Session) -> (usize, usize) {
    let total = s.route.len();
    let reviewed = s
        .route
        .iter()
        .filter(|e| {
            s.files
                .iter()
                .find(|f| f.file == e.file)
                .map(|f| {
                    matches!(
                        f.state,
                        FileState::Reviewed | FileState::Skipped | FileState::OutOfScope
                    )
                })
                .unwrap_or(false)
        })
        .count();
    (reviewed, total)
}

/// Print the session as JSON (when `--json`), else run the human fallback.
fn emit(
    cli: &Cli,
    s: &core::Session,
    human: impl FnOnce(),
) -> Result<(), Box<dyn std::error::Error>> {
    if cli.json {
        println!("{}", serde_json::to_string_pretty(s)?);
    } else {
        human();
    }
    Ok(())
}

fn emit_proposal(cli: &Cli, p: &core::Proposal) -> Result<(), Box<dyn std::error::Error>> {
    if cli.json {
        println!("{}", serde_json::to_string_pretty(p)?);
    } else {
        println!("proposed {} ({:?})", p.id, p.artifact_type);
    }
    Ok(())
}

fn print_session(s: &core::Session) {
    let (reviewed, total) = progress(s);
    println!("{}  [{:?}]  {}", s.id, s.status, s.title);
    if let Some(obj) = s.objective {
        println!("  objective: {obj:?}");
    }
    println!("  progress: {reviewed}/{total} files reviewed");
    if !s.route.is_empty() {
        println!("  route:");
        for (i, e) in s.route.iter().enumerate() {
            let here = if i == s.position { "→" } else { " " };
            let st = s
                .files
                .iter()
                .find(|f| f.file == e.file)
                .map(|f| format!("{:?}", f.state))
                .unwrap_or_else(|| "?".into());
            println!("   {here} {} [{st}]  {}", e.file, e.reason);
        }
    }
    let open: Vec<_> = s
        .proposals
        .iter()
        .filter(|p| p.state == core::ArtifactState::Proposed)
        .collect();
    if !open.is_empty() {
        println!("  open proposals: {}", open.len());
    }
    if let Some(sum) = &s.summary {
        println!("  summary: {sum}");
    }
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
            // Resolve and confirm the target is inside the project. A bare
            // `..` check misses absolute paths — `root.join("/etc/passwd")`
            // discards the base — so canonicalize both and compare prefixes.
            let base =
                std::fs::canonicalize(root_path).map_err(|_| "cannot resolve the project root")?;
            let target = std::fs::canonicalize(root_path.join(path))
                .map_err(|_| "no such file in the project")?;
            if !target.starts_with(&base) {
                return Err("path must be inside the project".into());
            }
            let text = std::fs::read_to_string(&target)?;
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
                ".git"
                    | "node_modules"
                    | "target"
                    | "dist"
                    | "build"
                    | ".next"
                    | "vendor"
                    | ".reado"
                    | ".claude"
                    | ".codex"
                    | ".github"
                    | ".vscode"
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
