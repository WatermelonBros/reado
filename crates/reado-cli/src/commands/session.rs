//! `reado session` — Guided Pair Review sessions: the durable record the agent
//! and human share.

use clap::Subcommand;
use reado_core as core;
use reado_core::{FileState, NewSession, Objective, ReviewScope, ScopeKind};

use crate::print::{emit, print_session};
use crate::Cli;

#[derive(Subcommand)]
pub(crate) enum SessionCmd {
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

#[derive(Clone, Copy, clap::ValueEnum)]
pub(crate) enum ScopeArg {
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
pub(crate) enum ObjectiveArg {
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
pub(crate) enum FileStateArg {
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

/// Guided Pair Review sessions: the durable record the agent and human share.
pub(crate) fn run(
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
                // The CLI's own `session create` has no git view of the scope;
                // the desktop supplies the file set when it knows it.
                expected_files: vec![],
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
pub(crate) fn progress(s: &core::Session) -> (usize, usize) {
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
