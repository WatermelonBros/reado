use super::{run_git, run_git_raw};
use std::path::Path;

use serde::Serialize;

/// The diff bases the user can compare against: local branches and recent commits.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRefs {
    pub branches: Vec<String>,
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub subject: String,
}

/// List local branches and the most recent commits, for the diff base picker.
#[tauri::command]
pub fn git_refs(root: String) -> GitRefs {
    let root = Path::new(&root);
    let branches = run_git(
        root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .map(|s| s.lines().map(str::to_string).collect())
    .unwrap_or_default();
    let commits = run_git(root, &["log", "-25", "--format=%h%x09%s"])
        .map(|s| {
            s.lines()
                .filter_map(|l| l.split_once('\t'))
                .map(|(h, s)| GitCommit {
                    hash: h.to_string(),
                    subject: s.to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    GitRefs { branches, commits }
}

/// The current HEAD commit hash (short), or None outside a repo. Used for cheap
/// "has the repo moved since X" freshness checks (e.g. repo onboarding).
#[tauri::command]
pub fn git_head(root: String) -> Option<String> {
    run_git(Path::new(&root), &["rev-parse", "--short", "HEAD"]).filter(|h| !h.is_empty())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCommit {
    pub hash: String,
    pub author: String,
    /// Commit (author) time as a Unix timestamp (seconds).
    pub time: i64,
    pub subject: String,
}

/// The commits that touched a file (most recent first), following renames, for
/// the Timeline panel. Empty when git is unavailable or the file is untracked.
#[tauri::command]
pub fn git_file_history(root: String, file: String) -> Vec<FileCommit> {
    // Unit-separator-delimited fields, one commit per line.
    let fmt = "--format=%H%x1f%an%x1f%at%x1f%s";
    let Some(out) = run_git_raw(
        Path::new(&root),
        &["log", "--follow", "--max-count=200", fmt, "--", &file],
    ) else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|l| {
            let mut it = l.split('\u{1f}');
            let hash = it.next()?;
            let author = it.next().unwrap_or("");
            let time = it.next().and_then(|t| t.parse().ok()).unwrap_or(0);
            let subject = it.next().unwrap_or("");
            Some(FileCommit {
                hash: hash.chars().take(8).collect(),
                author: author.to_string(),
                time,
                subject: subject.to_string(),
            })
        })
        .collect()
}

/// One commit as the graph draws it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub hash: String,
    /// Parent hashes: none for the root, two or more for a merge — which is
    /// what the lanes are drawn from.
    pub parents: Vec<String>,
    pub subject: String,
    pub author: String,
    /// Relative ("3 days ago"), because that is what the eye wants here.
    pub date: String,
    /// Branch and tag names pointing at this commit, already stripped of their
    /// `refs/` prefixes by `%D`.
    pub refs: Vec<String>,
}

/// The history of every branch, newest first, for the graph view.
///
/// `--date-order` rather than git's default: it keeps a branch's commits
/// together instead of interleaving branches by commit date, which is what makes
/// the lanes readable.
#[tauri::command]
pub fn git_graph(root: String, limit: u32) -> Vec<GraphCommit> {
    let limit = limit.clamp(1, 5000).to_string();
    run_git(
        Path::new(&root),
        &[
            "log",
            "--all",
            "--date-order",
            "--max-count",
            &limit,
            "--format=%H%x1f%P%x1f%s%x1f%an%x1f%ar%x1f%D",
        ],
    )
    .map(|s| {
        s.lines()
            .filter_map(|line| {
                let mut f = line.split('\x1f');
                Some(GraphCommit {
                    hash: f.next()?.to_string(),
                    parents: f.next()?.split_whitespace().map(str::to_string).collect(),
                    subject: f.next()?.to_string(),
                    author: f.next()?.to_string(),
                    date: f.next()?.to_string(),
                    refs: f
                        .next()
                        .unwrap_or("")
                        .split(", ")
                        .map(|r| r.trim().trim_start_matches("HEAD -> ").to_string())
                        .filter(|r| !r.is_empty())
                        .collect(),
                })
            })
            .collect()
    })
    .unwrap_or_default()
}
