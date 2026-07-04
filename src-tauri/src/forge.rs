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
use std::io::Write;
use std::path::Path;
use std::process::Stdio;

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

/// Match a hostname against the registry, `None` if no adapter recognises it.
fn forge_for_host(host: &str) -> Option<Forge> {
    let lower = host.to_lowercase();
    REGISTRY
        .iter()
        .find(|a| host_matches(&lower, a.host_pattern))
        .map(|a| Forge {
            provider: a.provider,
            host: host.to_string(),
            cli: a.cli.map(String::from),
            term: a.term.to_string(),
            has_adapter: a.cli.is_some(),
        })
}

/// The real hostname behind an SSH config alias, via `ssh -G <host>`. Returns
/// `None` when it resolves to itself (a plain hostname, not an alias) or on any
/// failure. This is what lets `git@mycompany:owner/repo` — where `mycompany` is
/// an `~/.ssh/config` alias for `gitlab.com` — be recognised as GitLab.
fn resolve_ssh_alias(host: &str) -> Option<String> {
    let out = command("ssh").args(["-G", host]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find_map(|l| l.strip_prefix("hostname ").map(str::trim))
        .filter(|h| !h.is_empty() && !h.eq_ignore_ascii_case(host))
        .map(str::to_string)
}

/// Resolve the forge for a remote URL through the registry. Falls back to
/// resolving an SSH config alias when the literal host isn't a known forge.
pub fn detect_from_remote(remote: &str) -> Forge {
    let host = parse_host(remote).unwrap_or_default();
    if let Some(f) = forge_for_host(&host) {
        return f;
    }
    if let Some(real) = resolve_ssh_alias(&host) {
        if let Some(f) = forge_for_host(&real) {
            return f;
        }
    }
    Forge {
        provider: Provider::Unknown,
        host,
        cli: None,
        term: "pull request".into(),
        has_adapter: false,
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

/// List open PRs/MRs via the detected forge's CLI. Returns an error carrying the
/// CLI's stderr (CLI missing, not authenticated, not a repo) so the caller can
/// say *why* the list is empty instead of silently falling back. A recognised
/// host with no CLI adapter is a benign empty list, not an error.
///
/// Async + `spawn_blocking`: the CLI does **network** I/O, so it must not run on
/// the main thread (a slow/hanging `gh`/`glab` would otherwise freeze the UI).
#[tauri::command]
pub async fn forge_list_prs(root: String) -> Result<Vec<Pr>, String> {
    match tauri::async_runtime::spawn_blocking(move || list_prs_blocking(root)).await {
        Ok(r) => r,
        Err(e) => Err(e.to_string()),
    }
}

fn list_prs_blocking(root: String) -> Result<Vec<Pr>, String> {
    let forge = detect_forge(root.clone());
    let Some(cli) = forge.cli.as_deref() else {
        return Ok(Vec::new());
    };
    let root_path = Path::new(&root);
    match cli {
        "gh" => gh_list(root_path),
        "glab" => glab_list(root_path),
        _ => Ok(Vec::new()),
    }
}

/// Run a read-only CLI op, preserving *why* it failed: a spawn error or the
/// process's stderr (mirroring [`checkout_pr_blocking`]). Callers surface or log
/// the error instead of letting it vanish into an empty result.
fn cli_out_result(root: &Path, program: &str, args: &[&str]) -> Result<String, String> {
    let out = command(program)
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("{program} exited with status {}", out.status)
        } else {
            stderr
        })
    }
}

/// Like [`cli_out_result`] but `None` on any failure — for best-effort reads
/// (PR fetch metadata, inline-comment diff refs) where an error just means we
/// skip that enrichment rather than surfacing it.
fn cli_out(root: &Path, program: &str, args: &[&str]) -> Option<String> {
    cli_out_result(root, program, args).ok()
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

fn gh_list(root: &Path) -> Result<Vec<Pr>, String> {
    let json = cli_out_result(
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
    )?;
    parse_gh_prs(&json)
}

/// Parse `gh pr list --json` output into PRs. Split out so the mapping (and its
/// error on malformed JSON) is unit-testable without spawning `gh`.
fn parse_gh_prs(json: &str) -> Result<Vec<Pr>, String> {
    let rows = serde_json::from_str::<Vec<serde_json::Value>>(json)
        .map_err(|e| format!("failed to parse gh output: {e}"))?;
    Ok(rows
        .into_iter()
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
        .collect())
}

fn glab_list(root: &Path) -> Result<Vec<Pr>, String> {
    let json = cli_out_result(root, "glab", &["mr", "list", "--output", "json"])?;
    parse_glab_prs(&json)
}

/// Parse `glab mr list --output json` into PRs. Split out for unit tests (see
/// [`parse_gh_prs`]).
fn parse_glab_prs(json: &str) -> Result<Vec<Pr>, String> {
    let rows = serde_json::from_str::<Vec<serde_json::Value>>(json)
        .map_err(|e| format!("failed to parse glab output: {e}"))?;
    Ok(rows
        .into_iter()
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
        .collect())
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

/// A PR fetched *without* checking it out: both sides materialised as hidden
/// refs (`refs/reado/pr-<n>` / `-base`) plus the files it touches. The working
/// tree and current branch are never moved — the review reads the PR's versions
/// straight from these refs (`git show <ref>:<path>`).
#[derive(Debug, Serialize)]
pub struct PrCheckout {
    /// The PR head, as a local ref.
    pub head: String,
    /// The PR base branch tip, as a local ref (the diff's left side).
    pub base: String,
    /// Files changed by the PR (`base...head`), forward-slash paths.
    pub files: Vec<String>,
}

/// Fetch a PR/MR non-destructively so a guided review can read it in place.
/// Unlike [`forge_checkout_pr`], this never touches the working tree or `HEAD`:
/// it only writes `refs/reado/*`. Async (network I/O in the CLI/git fetch).
#[tauri::command]
pub async fn forge_fetch_pr(root: String, number: u64) -> Result<PrCheckout, String> {
    match tauri::async_runtime::spawn_blocking(move || fetch_pr_blocking(root, number)).await {
        Ok(r) => r,
        Err(e) => Err(e.to_string()),
    }
}

fn fetch_pr_blocking(root: String, number: u64) -> Result<PrCheckout, String> {
    let forge = detect_forge(root.clone());
    let cli = forge
        .cli
        .as_deref()
        .ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    // The remote to fetch from — first configured remote, else `origin`.
    let remote = cli_out(root_path, "git", &["remote"])
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "origin".into());
    // The base branch, resolved from the forge (GitHub `baseRefName` /
    // GitLab `target_branch`) — that's the left side of the review diff.
    let base_branch = match cli {
        "gh" => cli_out(
            root_path,
            "gh",
            &[
                "pr",
                "view",
                &number.to_string(),
                "--json",
                "baseRefName",
                "--jq",
                ".baseRefName",
            ],
        ),
        "glab" => cli_out(
            root_path,
            "glab",
            &["mr", "view", &number.to_string(), "-F", "json"],
        )
        .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
        .and_then(|v| {
            v.get("target_branch")
                .and_then(|t| t.as_str())
                .map(str::to_string)
        }),
        _ => return Err("unsupported forge CLI".into()),
    }
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .ok_or("couldn't resolve the PR's base branch")?;
    // The forge-specific refspec exposing a PR/MR head to `git fetch`.
    let head_spec = match cli {
        "gh" => format!("pull/{number}/head:refs/reado/pr-{number}"),
        "glab" => format!("merge-requests/{number}/head:refs/reado/pr-{number}"),
        _ => return Err("unsupported forge CLI".into()),
    };
    // `+` forces the local ref up to date if the PR was re-pushed / rebased.
    git_fetch(root_path, &remote, &format!("+{head_spec}"))?;
    git_fetch(
        root_path,
        &remote,
        &format!("+refs/heads/{base_branch}:refs/reado/pr-{number}-base"),
    )?;
    let head = format!("refs/reado/pr-{number}");
    let base = format!("refs/reado/pr-{number}-base");
    // `base...head` (merge-base) mirrors what the forge shows as the PR's changes.
    let files = cli_out(
        root_path,
        "git",
        &["diff", "--name-only", &format!("{base}...{head}")],
    )
    .map(|s| {
        s.lines()
            .filter(|l| !l.is_empty())
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default();
    Ok(PrCheckout { head, base, files })
}

fn git_fetch(root: &Path, remote: &str, refspec: &str) -> Result<(), String> {
    let out = command("git")
        .current_dir(root)
        .args(["fetch", remote, refspec])
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

/// One line-anchored comment to post inline on the PR, mirroring a locally
/// authored Reado comment (never a pulled host thread — those already exist).
#[derive(Debug, serde::Deserialize)]
pub struct ReviewComment {
    pub path: String,
    pub line: u32,
    pub body: String,
}

/// Submit the session's review to the host as one batched review with a verdict.
/// `body` is the assembled review summary; `comments` are posted inline on the
/// exact PR lines (GitHub). Async (network) so it never blocks the main thread;
/// best-effort, errors surface to the UI.
#[tauri::command]
pub async fn forge_submit_review(
    root: String,
    number: u64,
    verdict: Verdict,
    body: String,
    comments: Vec<ReviewComment>,
) -> Result<(), String> {
    spawn_blocking_result(move || submit_review_blocking(root, number, verdict, body, comments))
        .await
}

fn submit_review_blocking(
    root: String,
    number: u64,
    verdict: Verdict,
    body: String,
    comments: Vec<ReviewComment>,
) -> Result<(), String> {
    let forge = detect_forge(root.clone());
    let cli = forge
        .cli
        .as_deref()
        .ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    // With inline comments, post them on their exact lines — a real, line-anchored
    // review rather than a flat summary. GitHub batches them into one review;
    // GitLab needs one positioned discussion per comment.
    if !comments.is_empty() {
        return match cli {
            "gh" => gh_review_with_comments(root_path, number, verdict, &body, &comments),
            "glab" => glab_review_with_comments(root_path, number, verdict, &body, &comments),
            _ => Err("unsupported forge CLI".into()),
        };
    }
    run_verdict(cli, root_path, number, verdict, &body)
}

/// Apply just the verdict + summary via the per-CLI review verbs (no inline
/// comments). `body` is coerced non-empty because `gh pr review --comment` and
/// GitLab notes reject an empty message.
fn run_verdict(
    cli: &str,
    root: &Path,
    number: u64,
    verdict: Verdict,
    body: &str,
) -> Result<(), String> {
    let n = number.to_string();
    let body = if body.trim().is_empty() {
        "Reviewed.".to_string()
    } else {
        body.to_string()
    };
    // A verdict may map to more than one command. On GitLab `mr approve` carries
    // no body, so we approve AND post the review summary as a note — otherwise
    // the session's content is silently dropped on approve.
    let runs: Vec<Vec<String>> = match (cli, verdict) {
        ("gh", Verdict::Approve) => vec![vec![
            "pr".into(),
            "review".into(),
            n,
            "--approve".into(),
            "-b".into(),
            body,
        ]],
        ("gh", Verdict::RequestChanges) => vec![vec![
            "pr".into(),
            "review".into(),
            n,
            "--request-changes".into(),
            "-b".into(),
            body,
        ]],
        ("gh", Verdict::Comment) => vec![vec![
            "pr".into(),
            "review".into(),
            n,
            "--comment".into(),
            "-b".into(),
            body,
        ]],
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
            .current_dir(root)
            .args(&arg_refs)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    }
    Ok(())
}

/// Post a GitHub review with line-anchored inline comments in one API call.
/// `gh api` fills `{owner}/{repo}` from the repo in `root`; the payload goes on
/// stdin so the (possibly large, multi-line) comment bodies need no escaping.
fn gh_review_with_comments(
    root: &Path,
    number: u64,
    verdict: Verdict,
    body: &str,
    comments: &[ReviewComment],
) -> Result<(), String> {
    let event = match verdict {
        Verdict::Approve => "APPROVE",
        Verdict::RequestChanges => "REQUEST_CHANGES",
        Verdict::Comment => "COMMENT",
    };
    let payload = serde_json::json!({
        "event": event,
        // APPROVE tolerates an empty body; COMMENT/REQUEST_CHANGES don't.
        "body": if body.trim().is_empty() { "Reviewed." } else { body },
        "comments": comments
            .iter()
            .map(|c| serde_json::json!({
                "path": c.path, "line": c.line, "side": "RIGHT", "body": c.body
            }))
            .collect::<Vec<_>>(),
    })
    .to_string();
    let mut child = command("gh")
        .current_dir(root)
        .args([
            "api",
            "--method",
            "POST",
            &format!("repos/{{owner}}/{{repo}}/pulls/{number}/reviews"),
            "--input",
            "-",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    {
        let mut stdin = child.stdin.take().ok_or("failed to open gh stdin")?;
        stdin
            .write_all(payload.as_bytes())
            .map_err(|e| e.to_string())?;
        // Dropping `stdin` here closes the pipe (EOF) so `gh` can proceed.
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Post a GitLab review: each comment becomes a positioned MR discussion on its
/// exact line, then the verdict + summary follow. GitLab rejects a position that
/// isn't on the MR diff, so any comment it won't take is folded into the summary
/// note rather than lost — best-effort, never a hard failure on positioning.
fn glab_review_with_comments(
    root: &Path,
    number: u64,
    verdict: Verdict,
    body: &str,
    comments: &[ReviewComment],
) -> Result<(), String> {
    let n = number.to_string();
    // The MR's diff SHAs are required to anchor a discussion to a line.
    let diff_refs = cli_out(
        root,
        "glab",
        &["api", &format!("projects/:id/merge_requests/{n}")],
    )
    .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok());
    let sha = |k: &str| {
        diff_refs
            .as_ref()
            .and_then(|v| v.pointer(&format!("/diff_refs/{k}")))
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string()
    };
    let (base, head, start) = (sha("base_sha"), sha("head_sha"), sha("start_sha"));

    // Comments GitLab wouldn't place inline — appended to the summary note below.
    let mut leftover: Vec<&ReviewComment> = Vec::new();
    if base.is_empty() || head.is_empty() {
        leftover.extend(comments.iter());
    } else {
        for c in comments {
            let path = format!("projects/:id/merge_requests/{n}/discussions");
            let args: Vec<String> = vec![
                "api".into(),
                "--method".into(),
                "POST".into(),
                path,
                "-f".into(),
                format!("body={}", c.body),
                "-f".into(),
                "position[position_type]=text".into(),
                "-f".into(),
                format!("position[base_sha]={base}"),
                "-f".into(),
                format!("position[head_sha]={head}"),
                "-f".into(),
                format!("position[start_sha]={start}"),
                "-f".into(),
                format!("position[new_path]={}", c.path),
                "-f".into(),
                format!("position[new_line]={}", c.line),
            ];
            let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
            let out = command("glab")
                .current_dir(root)
                .args(&arg_refs)
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                leftover.push(c);
            }
        }
    }
    // Verdict + summary, folding in whatever couldn't be positioned inline.
    let mut note = body.to_string();
    if !leftover.is_empty() {
        let extra: String = leftover
            .iter()
            .map(|c| format!("\n- {}:{} — {}", c.path, c.line, c.body))
            .collect();
        note = format!("{note}{extra}");
    }
    run_verdict("glab", root, number, verdict, &note)
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
    let out = cli_out_result(
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
    )
    .map_err(|e| {
        crate::log::warn(
            "forge",
            "gh repo view failed",
            serde_json::json!({ "error": e }),
        )
    })
    .ok()?;
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
        let json = match cli_out_result(root, "gh", &refs) {
            Ok(json) => json,
            Err(e) => {
                crate::log::warn(
                    "forge",
                    "gh threads query failed",
                    serde_json::json!({ "error": e }),
                );
                break;
            }
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
        let json = match cli_out_result(root, "glab", &["api", &path]) {
            Ok(json) => json,
            Err(e) => {
                crate::log::warn(
                    "forge",
                    "glab discussions query failed",
                    serde_json::json!({ "error": e }),
                );
                break;
            }
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

    #[test]
    fn parses_gh_pr_list() {
        let json = r#"[
          {"number":7,"title":"Fix it","author":{"login":"octocat"},"headRefName":"fix-it"},
          {"number":9,"title":"Add it","author":{"login":"hubot"},"headRefName":"add-it"}
        ]"#;
        let prs = parse_gh_prs(json).expect("valid json parses");
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].number, 7);
        assert_eq!(prs[0].title, "Fix it");
        assert_eq!(prs[0].author, "octocat");
        assert_eq!(prs[0].branch, "fix-it");
    }

    #[test]
    fn parses_glab_mr_list_by_iid() {
        let json = r#"[
          {"iid":3,"title":"MR","author":{"username":"alice"},"source_branch":"feat"}
        ]"#;
        let prs = parse_glab_prs(json).expect("valid json parses");
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 3);
        assert_eq!(prs[0].author, "alice");
        assert_eq!(prs[0].branch, "feat");
    }

    #[test]
    fn malformed_pr_json_is_an_error_not_empty() {
        // The key fix: a parse failure must surface as Err (so the UI + tracer
        // see *why* it failed), not silently collapse to an empty list.
        assert!(parse_gh_prs("not json").is_err());
        assert!(parse_glab_prs("{ broken").is_err());
    }

    #[test]
    fn list_prs_on_non_repo_is_empty_not_error() {
        // A directory with no git remote has no forge adapter — a benign empty
        // list, never an error.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        assert_eq!(list_prs_blocking(root).expect("no adapter is Ok").len(), 0);
    }
}
