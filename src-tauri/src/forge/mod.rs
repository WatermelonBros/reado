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

mod github;
mod gitlab;

use crate::proc::command;
use reado_core::{self as core, Comment};
use std::path::Path;
use std::process::Output;

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
    crate::git::run_git(Path::new(root), &["remote", "get-url", "origin"])
        .and_then(|url| non_empty(&url))
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

/// What a forge's CLI adapter does. Each first-class CLI (`gh`, `glab`) is one
/// implementation; the commands below pick it once with [`forge_cli`] and never
/// branch on the CLI's name again.
trait ForgeCli: Sync {
    /// The executable this adapter drives — the registry's `cli` name.
    fn program(&self) -> &'static str;
    /// The host-origin badge a pulled thread carries.
    fn origin(&self) -> &'static str;
    /// Open PRs/MRs, or the CLI's reason for failing.
    fn list_prs(&self, root: &Path) -> Result<Vec<Pr>, String>;
    /// The CLI arguments that check a PR/MR's branch out.
    fn checkout_args(&self, number: u64) -> Vec<String>;
    /// The PR's base branch as the forge reports it (GitHub `baseRefName` /
    /// GitLab `target_branch`) — the left side of the review diff.
    fn base_branch(&self, root: &Path, number: u64) -> Option<String>;
    /// The forge-specific refspec exposing a PR/MR head to `git fetch`.
    fn head_refspec(&self, number: u64) -> String;
    /// The CLI invocations that apply a verdict + (non-empty) summary.
    fn verdict_runs(&self, number: u64, verdict: Verdict, body: String) -> Vec<Vec<String>>;
    /// Post a review with line-anchored inline comments, then its verdict.
    fn review_with_comments(
        &self,
        root: &Path,
        number: u64,
        verdict: Verdict,
        body: &str,
        comments: &[ReviewComment],
    ) -> Result<(), String>;
    /// Every review thread on the PR/MR, paginated.
    fn threads(&self, root: &Path, number: u64) -> Vec<HostThread>;
    /// Resolve (or reopen) one host thread.
    fn resolve_thread(
        &self,
        root: &Path,
        number: u64,
        external_id: &str,
        resolved: bool,
    ) -> std::io::Result<Output>;
}

/// The adapters with a working CLI, looked up by the registry's `cli` name.
const CLIS: &[&dyn ForgeCli] = &[&github::GitHub, &gitlab::GitLab];

/// The CLI adapter for a project's forge, or `None` when its host has none.
fn forge_cli(root: &str) -> Option<&'static dyn ForgeCli> {
    let forge = detect_forge(root.to_string());
    let name = forge.cli.as_deref()?;
    CLIS.iter().copied().find(|c| c.program() == name)
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
    let Some(cli) = forge_cli(&root) else {
        return Ok(Vec::new());
    };
    cli.list_prs(Path::new(&root))
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

/// Fetch and check out a PR/MR's branch so a guided review reads it with the full
/// read-first experience. Errors surface to the UI (e.g. CLI missing / auth).
/// Async (network: fetch + checkout) so it never blocks the main thread.
#[tauri::command]
pub async fn forge_checkout_pr(root: String, number: u64) -> Result<(), String> {
    spawn_blocking_result(move || checkout_pr_blocking(root, number)).await
}

fn checkout_pr_blocking(root: String, number: u64) -> Result<(), String> {
    let cli = forge_cli(&root).ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    let args = cli.checkout_args(number);
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = command(cli.program())
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
    let cli = forge_cli(&root).ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    // The remote to fetch from — first configured remote, else `origin`.
    let remote = crate::git::run_git(root_path, &["remote"])
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "origin".into());
    // The base branch, resolved from the forge (GitHub `baseRefName` /
    // GitLab `target_branch`) — that's the left side of the review diff.
    let base_branch = cli
        .base_branch(root_path, number)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("couldn't resolve the PR's base branch")?;
    // The forge-specific refspec exposing a PR/MR head to `git fetch`.
    let head_spec = cli.head_refspec(number);
    // `+` forces the local ref up to date if the PR was re-pushed / rebased.
    crate::git::run_git_checked(&root, &["fetch", &remote, &format!("+{head_spec}")])?;
    crate::git::run_git_checked(
        &root,
        &[
            "fetch",
            &remote,
            &format!("+refs/heads/{base_branch}:refs/reado/pr-{number}-base"),
        ],
    )?;
    let head = format!("refs/reado/pr-{number}");
    let base = format!("refs/reado/pr-{number}-base");
    // `base...head` (merge-base) mirrors what the forge shows as the PR's changes.
    let files = crate::git::run_git(
        root_path,
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
    let cli = forge_cli(&root).ok_or("no forge adapter for this remote")?;
    let root_path = Path::new(&root);
    // With inline comments, post them on their exact lines — a real, line-anchored
    // review rather than a flat summary. GitHub batches them into one review;
    // GitLab needs one positioned discussion per comment.
    if !comments.is_empty() {
        return cli.review_with_comments(root_path, number, verdict, &body, &comments);
    }
    run_verdict(cli, root_path, number, verdict, &body)
}

/// Apply just the verdict + summary via the per-CLI review verbs (no inline
/// comments). `body` is coerced non-empty because `gh pr review --comment` and
/// GitLab notes reject an empty message.
fn run_verdict(
    cli: &dyn ForgeCli,
    root: &Path,
    number: u64,
    verdict: Verdict,
    body: &str,
) -> Result<(), String> {
    let body = if body.trim().is_empty() {
        "Reviewed.".to_string()
    } else {
        body.to_string()
    };
    // A verdict may map to more than one command (see each forge's
    // `verdict_runs`).
    let runs = cli.verdict_runs(number, verdict, body);
    for run in &runs {
        let arg_refs: Vec<&str> = run.iter().map(String::as_str).collect();
        let out = command(cli.program())
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

/// Safety cap on pages, so a malformed pageInfo can never loop forever.
const MAX_PAGES: usize = 50;

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
    let mut result = PullResult {
        comments: Vec::new(),
        dropped: 0,
    };
    let Some(cli) = forge_cli(&root) else {
        return result;
    };
    let (origin, threads) = (cli.origin(), cli.threads(Path::new(&root), number));

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
    let cli = forge_cli(&root).ok_or("no forge adapter for this remote")?;
    let out = cli
        .resolve_thread(Path::new(&root), number, &external_id, resolved)
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
    fn malformed_json_maps_to_empty() {
        assert!(github::map_gh_threads("not json").is_empty());
        assert!(gitlab::map_glab_discussions("{}").is_empty());
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

        // The same must hold for the *dotted* patterns, which take the other
        // branch: a bare `ends_with` would hand `notvisualstudio.com` to the
        // Azure adapter and post review comments at somebody else's host.
        assert!(!host_matches("notvisualstudio.com", "visualstudio.com"));
        assert!(host_matches("visualstudio.com", "visualstudio.com"));
        assert!(host_matches("myorg.visualstudio.com", "visualstudio.com"));
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
    fn malformed_pr_json_is_an_error_not_empty() {
        // The key fix: a parse failure must surface as Err (so the UI + tracer
        // see *why* it failed), not silently collapse to an empty list.
        assert!(github::parse_gh_prs("not json").is_err());
        assert!(gitlab::parse_glab_prs("{ broken").is_err());
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
