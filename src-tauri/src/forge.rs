//! The forge adapter for guided reviews — detect the hosting forge from the
//! repo's `origin` remote and drive its CLI (`gh`/`glab`) to open a PR/MR as a
//! review *source* (fetch + checkout) and round-trip the results as a *sink*
//! (pull threads, submit a batched review with a verdict).
//!
//! It is an **extensible provider registry**: each adapter declares its host
//! pattern, the tool it drives, how to install it, and its PR/MR terminology.
//! GitHub (`gh`) and GitLab (`glab`) ship first; other forges slot in by adding
//! a [`Provider`] without reworking the rest. A repo whose host has no adapter
//! stays fully reviewable *locally* (guided-pair-review) — only the host
//! round-trip is unavailable, and we say so rather than failing.

use crate::proc::command;
use reado_core::{self as core, Comment};
use std::path::Path;

use serde::Serialize;

/// A known forge with a first-class CLI, or a graceful fallback.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    GitHub,
    GitLab,
    Bitbucket,
    Gitea,
    AzureDevops,
    /// Host couldn't be matched to an adapter (self-hosted, or no remote).
    Unknown,
}

/// One registry entry: how to recognise a forge and what drives it.
struct Adapter {
    provider: Provider,
    /// Substring matched against the remote host (lowercased).
    host_pattern: &'static str,
    /// The CLI this adapter drives, or `None` when no first-class CLI ships yet.
    cli: Option<&'static str>,
    /// What this forge calls a change request.
    term: &'static str,
}

/// The provider registry. GitHub + GitLab have first-class CLIs and ship as
/// working adapters; the others are recognised (so we can name them and say the
/// round-trip isn't available yet) until their integration lands.
const REGISTRY: &[Adapter] = &[
    Adapter {
        provider: Provider::GitHub,
        host_pattern: "github",
        cli: Some("gh"),
        term: "pull request",
    },
    Adapter {
        provider: Provider::GitLab,
        host_pattern: "gitlab",
        cli: Some("glab"),
        term: "merge request",
    },
    Adapter {
        provider: Provider::Bitbucket,
        host_pattern: "bitbucket",
        cli: None,
        term: "pull request",
    },
    Adapter {
        provider: Provider::Gitea,
        host_pattern: "gitea",
        cli: None,
        term: "pull request",
    },
    Adapter {
        provider: Provider::AzureDevops,
        host_pattern: "azure",
        cli: None,
        term: "pull request",
    },
    Adapter {
        provider: Provider::AzureDevops,
        host_pattern: "visualstudio.com",
        cli: None,
        term: "pull request",
    },
];

/// The detected forge for a project, sent to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Forge {
    pub provider: Provider,
    /// The remote host (e.g. `github.com`), or empty when there's no remote.
    pub host: String,
    /// The CLI to drive (`gh`/`glab`), or `None` when no adapter has one.
    pub cli: Option<String>,
    /// This forge's term for a change request ("pull request"/"merge request").
    pub term: String,
    /// True when a working adapter (with a CLI) backs this host. When false, the
    /// guided review still runs locally; only the host round-trip is unavailable.
    pub has_adapter: bool,
}

/// Extract the host from a git remote URL across its forms:
/// `git@host:owner/repo.git`, `https://host/owner/repo.git`,
/// `ssh://git@host:port/owner/repo`.
pub fn parse_host(remote: &str) -> Option<String> {
    let remote = remote.trim();
    if remote.is_empty() {
        return None;
    }
    // scp-like: git@host:owner/repo.git
    if !remote.contains("://") {
        if let Some(at) = remote.find('@') {
            let after = &remote[at + 1..];
            let host = after.split(':').next()?;
            return non_empty(host);
        }
    }
    // URL form: scheme://[user@]host[:port]/path
    let after_scheme = remote.split("://").nth(1).unwrap_or(remote);
    let authority = after_scheme.split('/').next()?;
    let host_port = authority.rsplit('@').next()?; // drop optional user@
    let host = host_port.split(':').next()?; // drop optional :port
    non_empty(host)
}

fn non_empty(s: &str) -> Option<String> {
    let s = s.trim().to_lowercase();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Whether `host` belongs to a forge identified by `pattern`. Matches on domain
/// boundaries, not a bare substring, so `notgithub.example.com` doesn't match
/// `github` while `github.com` and a self-hosted `github.mycorp.com` do. A
/// dotted pattern (e.g. `visualstudio.com`) matches the host or its subdomains.
fn host_matches(host: &str, pattern: &str) -> bool {
    if pattern.contains('.') {
        host == pattern || host.ends_with(&format!(".{pattern}"))
    } else {
        host.split('.').any(|label| label == pattern)
    }
}

/// Resolve the forge for a remote URL through the registry.
pub fn detect_from_remote(remote: &str) -> Forge {
    let host = parse_host(remote).unwrap_or_default();
    let lower = host.to_lowercase();
    let matched = REGISTRY
        .iter()
        .find(|a| host_matches(&lower, a.host_pattern));
    match matched {
        Some(a) => Forge {
            provider: a.provider,
            host,
            cli: a.cli.map(String::from),
            term: a.term.to_string(),
            has_adapter: a.cli.is_some(),
        },
        None => Forge {
            provider: Provider::Unknown,
            host,
            cli: None,
            term: "pull request".into(),
            has_adapter: false,
        },
    }
}

fn origin_url(root: &str) -> Option<String> {
    let out = command("git")
        .arg("-C")
        .arg(root)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    if out.status.success() {
        non_empty(&String::from_utf8_lossy(&out.stdout))
    } else {
        None
    }
}

/// Detect the forge from a project's `origin` remote. Never errors: no remote or
/// no `git` yields an `Unknown` forge (the guided review still runs locally).
#[tauri::command]
pub fn detect_forge(root: String) -> Forge {
    match origin_url(&root) {
        Some(url) => detect_from_remote(&url),
        None => Forge {
            provider: Provider::Unknown,
            host: String::new(),
            cli: None,
            term: "pull request".into(),
            has_adapter: false,
        },
    }
}

/// Whether a CLI is on PATH (so we can offer to install the matching one).
///
/// Uses the shared login-shell PATH probe — not `which`/`where`, which run with
/// the GUI's stripped PATH and miss brew/winget installs that the integrated
/// terminal finds fine (the "gh is installed but Reado says it isn't" bug).
#[tauri::command]
pub fn forge_cli_present(cli: String) -> bool {
    crate::proc::on_path(&cli)
}

/// A pull/merge request, normalised across forges for the picker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pr {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub branch: String,
}

/// List open PRs/MRs via the detected forge's CLI. Empty on any failure (no
/// adapter, CLI missing, not authenticated) — the caller falls back to local.
///
/// Async + `spawn_blocking`: the CLI does **network** I/O, so it must not run on
/// the main thread (a slow/hanging `gh`/`glab` would otherwise freeze the UI).
#[tauri::command]
pub async fn forge_list_prs(root: String) -> Vec<Pr> {
    tauri::async_runtime::spawn_blocking(move || list_prs_blocking(root))
        .await
        .unwrap_or_default()
}

fn list_prs_blocking(root: String) -> Vec<Pr> {
    let forge = detect_forge(root.clone());
    let Some(cli) = forge.cli.as_deref() else {
        return Vec::new();
    };
    let root_path = Path::new(&root);
    match cli {
        "gh" => gh_list(root_path),
        "glab" => glab_list(root_path),
        _ => Vec::new(),
    }
}

fn cli_out(root: &Path, program: &str, args: &[&str]) -> Option<String> {
    let out = command(program)
        .current_dir(root)
        .args(args)
        .output()
        .ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        None
    }
}

/// Run a blocking, fallible CLI op off the main thread (so network I/O in
/// `gh`/`glab` can't freeze the UI), flattening the join error.
async fn spawn_blocking_result<F>(f: F) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String> + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(r) => r,
        Err(e) => Err(e.to_string()),
    }
}

fn gh_list(root: &Path) -> Vec<Pr> {
    let Some(json) = cli_out(
        root,
        "gh",
        &[
            "pr",
            "list",
            "--state",
            "open",
            "--json",
            "number,title,author,headRefName",
            "--limit",
            "50",
        ],
    ) else {
        return Vec::new();
    };
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&json) else {
        return Vec::new();
    };
    rows.into_iter()
        .filter_map(|r| {
            Some(Pr {
                number: r.get("number")?.as_u64()?,
                title: r.get("title")?.as_str()?.to_string(),
                author: r
                    .get("author")
                    .and_then(|a| a.get("login"))
                    .and_then(|l| l.as_str())
                    .unwrap_or("")
                    .to_string(),
                branch: r
                    .get("headRefName")
                    .and_then(|b| b.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

fn glab_list(root: &Path) -> Vec<Pr> {
    let Some(json) = cli_out(root, "glab", &["mr", "list", "--output", "json"]) else {
        return Vec::new();
    };
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&json) else {
        return Vec::new();
    };
    rows.into_iter()
        .filter_map(|r| {
            Some(Pr {
                number: r.get("iid").or_else(|| r.get("number"))?.as_u64()?,
                title: r.get("title")?.as_str()?.to_string(),
                author: r
                    .get("author")
                    .and_then(|a| a.get("username"))
                    .and_then(|l| l.as_str())
                    .unwrap_or("")
                    .to_string(),
                branch: r
                    .get("source_branch")
                    .and_then(|b| b.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

/// Fetch and check out a PR/MR's branch so a guided review reads it with the full
/// read-first experience. Errors surface to the UI (e.g. CLI missing / auth).
/// Async (network: fetch + checkout) so it never blocks the main thread.
#[tauri::command]
pub async fn forge_checkout_pr(root: String, number: u64) -> Result<(), String> {
    spawn_blocking_result(move || checkout_pr_blocking(root, number)).await
}

fn checkout_pr_blocking(root: String, number: u64) -> Result<(), String> {
    let forge = detect_forge(root.clone());
    let cli = forge
        .cli
        .as_deref()
        .ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    let args: Vec<String> = match cli {
        "gh" => vec!["pr".into(), "checkout".into(), number.to_string()],
        "glab" => vec!["mr".into(), "checkout".into(), number.to_string()],
        _ => return Err("unsupported forge CLI".into()),
    };
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = command(cli)
        .current_dir(root_path)
        .args(&arg_refs)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// The verdict to attach to a submitted review, mapped per forge.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Approve,
    RequestChanges,
    Comment,
}

/// Submit the session's review to the host as one batched review with a verdict.
/// `body` is the assembled review summary. Async (network) so it never blocks the
/// main thread; best-effort, errors surface to the UI.
#[tauri::command]
pub async fn forge_submit_review(
    root: String,
    number: u64,
    verdict: Verdict,
    body: String,
) -> Result<(), String> {
    spawn_blocking_result(move || submit_review_blocking(root, number, verdict, body)).await
}

fn submit_review_blocking(
    root: String,
    number: u64,
    verdict: Verdict,
    body: String,
) -> Result<(), String> {
    let forge = detect_forge(root.clone());
    let cli = forge
        .cli
        .as_deref()
        .ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    let n = number.to_string();
    // `gh pr review --comment/--request-changes` rejects an empty body (only
    // --approve tolerates it), so never send one.
    let body = if body.trim().is_empty() {
        "Reviewed.".to_string()
    } else {
        body
    };
    // A verdict may map to more than one command. On GitLab `mr approve` carries
    // no body, so we approve AND post the review summary as a note — otherwise
    // the session's content is silently dropped on approve.
    let runs: Vec<Vec<String>> = match (cli, verdict) {
        ("gh", Verdict::Approve) => {
            vec![vec![
                "pr".into(),
                "review".into(),
                n,
                "--approve".into(),
                "-b".into(),
                body,
            ]]
        }
        ("gh", Verdict::RequestChanges) => vec![vec![
            "pr".into(),
            "review".into(),
            n,
            "--request-changes".into(),
            "-b".into(),
            body,
        ]],
        ("gh", Verdict::Comment) => {
            vec![vec![
                "pr".into(),
                "review".into(),
                n,
                "--comment".into(),
                "-b".into(),
                body,
            ]]
        }
        ("glab", Verdict::Approve) => vec![
            vec!["mr".into(), "approve".into(), n.clone()],
            vec!["mr".into(), "note".into(), n, "-m".into(), body],
        ],
        // glab has no request-changes verb; record the review as a note.
        ("glab", _) => vec![vec!["mr".into(), "note".into(), n, "-m".into(), body]],
        _ => return Err("unsupported forge CLI".into()),
    };
    for run in &runs {
        let arg_refs: Vec<&str> = run.iter().map(String::as_str).collect();
        let out = command(cli)
            .current_dir(root_path)
            .args(&arg_refs)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    }
    Ok(())
}

// ---- Pull existing threads -------------------------------------------------

/// A host review thread normalised across forges, ready to mirror as a comment.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostThread {
    /// The host thread/discussion id — the key for resolution sync.
    pub external_id: String,
    pub file: String,
    pub line: u32,
    pub author: String,
    pub body: String,
    pub resolved: bool,
}

/// The GraphQL query for a page of a PR's review threads (path, line, resolution,
/// comments). `$cursor` is null on the first page; pageInfo drives pagination.
const GH_THREADS_QUERY: &str = "query($owner:String!,$repo:String!,$number:Int!,$cursor:String){\
repository(owner:$owner,name:$repo){pullRequest(number:$number){\
reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{id isResolved path line \
comments(first:100){nodes{author{login} body}}}}}}}";

/// pageInfo (hasNextPage, endCursor) from a reviewThreads response page.
fn gh_page_info(json: &str) -> (bool, Option<String>) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else {
        return (false, None);
    };
    let pi = v.pointer("/data/repository/pullRequest/reviewThreads/pageInfo");
    let has = pi
        .and_then(|p| p.get("hasNextPage"))
        .and_then(|b| b.as_bool())
        .unwrap_or(false);
    let end = pi
        .and_then(|p| p.get("endCursor"))
        .and_then(|c| c.as_str())
        .map(String::from);
    (has, end)
}

/// Map GitHub's `reviewThreads` GraphQL response to normalised threads.
/// Pure (no I/O) so it's unit-testable against captured payloads.
pub fn map_gh_threads(json: &str) -> Vec<HostThread> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let nodes = v
        .pointer("/data/repository/pullRequest/reviewThreads/nodes")
        .and_then(|n| n.as_array())
        .cloned()
        .unwrap_or_default();
    nodes
        .iter()
        .filter_map(|t| {
            let comments = t
                .pointer("/comments/nodes")
                .and_then(|c| c.as_array())
                .cloned()
                .unwrap_or_default();
            let author = comments
                .first()
                .and_then(|c| c.pointer("/author/login"))
                .and_then(|l| l.as_str())
                .unwrap_or("")
                .to_string();
            // Preserve the whole thread as "login: body" lines.
            let body = comments
                .iter()
                .map(|c| {
                    let who = c
                        .pointer("/author/login")
                        .and_then(|l| l.as_str())
                        .unwrap_or("");
                    let text = c.get("body").and_then(|b| b.as_str()).unwrap_or("");
                    format!("{who}: {text}")
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            Some(HostThread {
                external_id: t.get("id")?.as_str()?.to_string(),
                file: t
                    .get("path")
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string(),
                line: t.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32,
                author,
                body,
                resolved: t
                    .get("isResolved")
                    .and_then(|r| r.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect()
}

/// Map GitLab's merge-request `discussions` response to normalised threads.
/// Only diff discussions (with a file position) are kept. Pure / testable.
pub fn map_glab_discussions(json: &str) -> Vec<HostThread> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(discussions) = v.as_array() else {
        return Vec::new();
    };
    discussions
        .iter()
        .filter_map(|d| {
            let notes = d.get("notes").and_then(|n| n.as_array())?;
            let first = notes.first()?;
            let pos = first.get("position")?;
            // Prefer the new side; fall back to the old path/line so a comment on
            // a removed line is kept (anchored to its pre-image) rather than dropped.
            let file = pos
                .get("new_path")
                .and_then(|p| p.as_str())
                .or_else(|| pos.get("old_path").and_then(|p| p.as_str()))?
                .to_string();
            let line = pos
                .get("new_line")
                .and_then(|l| l.as_u64())
                .or_else(|| pos.get("old_line").and_then(|l| l.as_u64()))
                .unwrap_or(0) as u32;
            let author = first
                .pointer("/author/username")
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string();
            let body = notes
                .iter()
                .map(|n| {
                    let who = n
                        .pointer("/author/username")
                        .and_then(|u| u.as_str())
                        .unwrap_or("");
                    let text = n.get("body").and_then(|b| b.as_str()).unwrap_or("");
                    format!("{who}: {text}")
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            let resolved = first
                .get("resolved")
                .and_then(|r| r.as_bool())
                .unwrap_or(false);
            Some(HostThread {
                external_id: d.get("id")?.as_str()?.to_string(),
                file,
                line,
                author,
                body,
                resolved,
            })
        })
        .collect()
}

/// `owner/repo` for the current GitHub repo (via `gh`), split into parts.
fn gh_name_with_owner(root: &Path) -> Option<(String, String)> {
    let out = cli_out(
        root,
        "gh",
        &[
            "repo",
            "view",
            "--json",
            "nameWithOwner",
            "-q",
            ".nameWithOwner",
        ],
    )?;
    let s = out.trim();
    let (owner, repo) = s.split_once('/')?;
    Some((owner.to_string(), repo.to_string()))
}

/// Safety cap on pages, so a malformed pageInfo can never loop forever.
const MAX_PAGES: usize = 50;

/// All review threads for a GitHub PR, following reviewThreads pagination so
/// large PRs don't silently lose threads past the first page.
fn gh_all_threads(root: &Path, number: u64) -> Vec<HostThread> {
    let Some((owner, repo)) = gh_name_with_owner(root) else {
        return Vec::new();
    };
    let mut all = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let mut args: Vec<String> = vec![
            "api".into(),
            "graphql".into(),
            "-f".into(),
            format!("query={GH_THREADS_QUERY}"),
            "-F".into(),
            format!("owner={owner}"),
            "-F".into(),
            format!("repo={repo}"),
            "-F".into(),
            format!("number={number}"),
        ];
        // A nullable GraphQL var left unset defaults to null (the first page).
        if let Some(c) = &cursor {
            args.push("-F".into());
            args.push(format!("cursor={c}"));
        }
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let Some(json) = cli_out(root, "gh", &refs) else {
            break;
        };
        all.extend(map_gh_threads(&json));
        match gh_page_info(&json) {
            (true, Some(end)) => cursor = Some(end),
            _ => break,
        }
    }
    all
}

/// All diff discussions for a GitLab MR, paging until a short page (REST has no
/// cursor; we walk `?per_page=100&page=N`).
fn glab_all_threads(root: &Path, number: u64) -> Vec<HostThread> {
    let mut all = Vec::new();
    for page in 1..=MAX_PAGES {
        let path =
            format!("projects/:id/merge_requests/{number}/discussions?per_page=100&page={page}");
        let Some(json) = cli_out(root, "glab", &["api", &path]) else {
            break;
        };
        // Page by the RAW discussion count (map filters out non-diff ones).
        let raw = serde_json::from_str::<serde_json::Value>(&json)
            .ok()
            .and_then(|v| v.as_array().map(|a| a.len()))
            .unwrap_or(0);
        all.extend(map_glab_discussions(&json));
        if raw < 100 {
            break;
        }
    }
    all
}

/// The outcome of a thread pull: the mirrored comments plus how many host threads
/// failed to import — so a partial sync isn't silently shown as complete.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub comments: Vec<Comment>,
    pub dropped: usize,
}

/// Pull a PR/MR's existing review threads into Reado's comment inbox as anchored
/// comments carrying a host origin badge, keyed by thread id so re-pulls are
/// idempotent and reflect the host's resolved state. Paginated; reports how many
/// threads failed to import. Async (network) so it never blocks the main thread.
#[tauri::command]
pub async fn forge_pull_threads(root: String, number: u64) -> PullResult {
    tauri::async_runtime::spawn_blocking(move || pull_threads_blocking(root, number))
        .await
        .unwrap_or(PullResult {
            comments: Vec::new(),
            dropped: 0,
        })
}

fn pull_threads_blocking(root: String, number: u64) -> PullResult {
    let forge = detect_forge(root.clone());
    let mut result = PullResult {
        comments: Vec::new(),
        dropped: 0,
    };
    let Some(cli) = forge.cli.as_deref() else {
        return result;
    };
    let root_path = Path::new(&root);
    let (origin, threads) = match cli {
        "gh" => ("github", gh_all_threads(root_path, number)),
        "glab" => ("gitlab", glab_all_threads(root_path, number)),
        _ => return result,
    };

    for t in threads.into_iter().filter(|t| !t.file.is_empty()) {
        match core::upsert_host_comment(
            &root,
            origin,
            &t.external_id,
            &number.to_string(),
            &t.file,
            t.line,
            &t.author,
            t.body,
            t.resolved,
        ) {
            Ok(c) => result.comments.push(c),
            // Don't drop silently: count it so the UI can warn about a partial sync.
            Err(_) => result.dropped += 1,
        }
    }
    result
}

/// Resolve (or reopen) a host thread to sync a resolution made in Reado. The
/// `external_id` is the host thread/discussion id from `forge_pull_threads`.
/// Async (network) so it never blocks the main thread.
#[tauri::command]
pub async fn forge_resolve_thread(
    root: String,
    number: u64,
    external_id: String,
    resolved: bool,
) -> Result<(), String> {
    spawn_blocking_result(move || resolve_thread_blocking(root, number, external_id, resolved))
        .await
}

fn resolve_thread_blocking(
    root: String,
    number: u64,
    external_id: String,
    resolved: bool,
) -> Result<(), String> {
    let forge = detect_forge(root.clone());
    let cli = forge
        .cli
        .as_deref()
        .ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    let out = match cli {
        "gh" => {
            let mutation = if resolved {
                "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}"
            } else {
                "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id}}}"
            };
            command("gh")
                .current_dir(root_path)
                .args([
                    "api",
                    "graphql",
                    "-f",
                    &format!("query={mutation}"),
                    "-F",
                    &format!("id={external_id}"),
                ])
                .output()
        }
        "glab" => command("glab")
            .current_dir(root_path)
            .args([
                "api",
                "--method",
                "PUT",
                &format!("projects/:id/merge_requests/{number}/discussions/{external_id}"),
                "-f",
                &format!("resolved={resolved}"),
            ])
            .output(),
        _ => return Err("unsupported forge CLI".into()),
    }
    .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_github_review_threads() {
        let json = r#"{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[
          {"id":"PRRT_1","isResolved":false,"path":"src/a.rs","line":12,
           "comments":{"nodes":[{"author":{"login":"octocat"},"body":"off by one"}]}},
          {"id":"PRRT_2","isResolved":true,"path":"src/b.rs","line":3,
           "comments":{"nodes":[{"author":{"login":"hubot"},"body":"fixed?"},{"author":{"login":"octocat"},"body":"yes"}]}}
        ]}}}}}"#;
        let threads = map_gh_threads(json);
        assert_eq!(threads.len(), 2);
        assert_eq!(threads[0].external_id, "PRRT_1");
        assert_eq!(threads[0].file, "src/a.rs");
        assert_eq!(threads[0].line, 12);
        assert_eq!(threads[0].author, "octocat");
        assert!(!threads[0].resolved);
        assert!(threads[1].resolved);
        assert!(threads[1].body.contains("hubot:") && threads[1].body.contains("octocat:"));
    }

    #[test]
    fn github_outdated_thread_has_null_line() {
        let json = r#"{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[
          {"id":"T","isResolved":false,"path":"src/a.rs","line":null,
           "comments":{"nodes":[{"author":{"login":"x"},"body":"hi"}]}}]}}}}}"#;
        let threads = map_gh_threads(json);
        assert_eq!(threads[0].line, 0);
    }

    #[test]
    fn maps_gitlab_diff_discussions_only() {
        let json = r#"[
          {"id":"d1","notes":[{"author":{"username":"alice"},"body":"nit","resolved":false,
            "position":{"new_path":"src/a.rs","new_line":10}}]},
          {"id":"d2","notes":[{"author":{"username":"bob"},"body":"general comment"}]}
        ]"#;
        let threads = map_glab_discussions(json);
        // The second discussion has no position → dropped (not a diff thread).
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].external_id, "d1");
        assert_eq!(threads[0].file, "src/a.rs");
        assert_eq!(threads[0].line, 10);
        assert_eq!(threads[0].author, "alice");
    }

    #[test]
    fn malformed_json_maps_to_empty() {
        assert!(map_gh_threads("not json").is_empty());
        assert!(map_glab_discussions("{}").is_empty());
    }

    #[test]
    fn parses_scp_form() {
        assert_eq!(
            parse_host("git@github.com:owner/repo.git").as_deref(),
            Some("github.com")
        );
    }

    #[test]
    fn parses_https_form() {
        assert_eq!(
            parse_host("https://gitlab.com/group/sub/repo.git").as_deref(),
            Some("gitlab.com")
        );
    }

    #[test]
    fn parses_ssh_with_user_and_port() {
        assert_eq!(
            parse_host("ssh://git@gitlab.example.com:2222/group/repo.git").as_deref(),
            Some("gitlab.example.com")
        );
    }

    #[test]
    fn empty_remote_has_no_host() {
        assert_eq!(parse_host("  "), None);
    }

    #[test]
    fn github_detects_gh() {
        let f = detect_from_remote("git@github.com:owner/repo.git");
        assert_eq!(f.provider, Provider::GitHub);
        assert_eq!(f.cli.as_deref(), Some("gh"));
        assert_eq!(f.term, "pull request");
        assert!(f.has_adapter);
    }

    #[test]
    fn gitlab_detects_glab_and_mr_term() {
        let f = detect_from_remote("https://gitlab.com/group/repo.git");
        assert_eq!(f.provider, Provider::GitLab);
        assert_eq!(f.cli.as_deref(), Some("glab"));
        assert_eq!(f.term, "merge request");
        assert!(f.has_adapter);
    }

    #[test]
    fn self_hosted_gitlab_still_recognised_by_host() {
        // A self-hosted GitLab whose host contains "gitlab" still maps to glab.
        let f = detect_from_remote("git@gitlab.internal.corp:team/repo.git");
        assert_eq!(f.provider, Provider::GitLab);
        assert!(f.has_adapter);
    }

    #[test]
    fn bitbucket_recognised_but_no_adapter() {
        let f = detect_from_remote("https://bitbucket.org/team/repo.git");
        assert_eq!(f.provider, Provider::Bitbucket);
        assert_eq!(f.cli, None);
        assert!(!f.has_adapter); // reviewable locally, no host round-trip
    }

    #[test]
    fn lookalike_host_does_not_false_match() {
        // A host that merely contains "github" as a substring must not map to gh.
        let f = detect_from_remote("git@notgithub.example.com:team/repo.git");
        assert_eq!(f.provider, Provider::Unknown);
        assert!(!f.has_adapter);
    }

    #[test]
    fn github_enterprise_subdomain_matches() {
        let f = detect_from_remote("git@github.mycorp.com:team/repo.git");
        assert_eq!(f.provider, Provider::GitHub);
    }

    #[test]
    fn unknown_host_falls_back() {
        let f = detect_from_remote("git@example.com:team/repo.git");
        assert_eq!(f.provider, Provider::Unknown);
        assert!(!f.has_adapter);
        assert_eq!(f.host, "example.com");
    }

    #[test]
    fn no_remote_is_unknown() {
        let f = detect_from_remote("");
        assert_eq!(f.provider, Provider::Unknown);
        assert_eq!(f.host, "");
    }
}
