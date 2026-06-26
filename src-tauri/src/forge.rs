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

/// Resolve the forge for a remote URL through the registry.
pub fn detect_from_remote(remote: &str) -> Forge {
    let host = parse_host(remote).unwrap_or_default();
    let lower = host.to_lowercase();
    let matched = REGISTRY.iter().find(|a| lower.contains(a.host_pattern));
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
#[tauri::command]
pub fn forge_cli_present(cli: String) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    command(probe)
        .arg(&cli)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
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
#[tauri::command]
pub fn forge_list_prs(root: String) -> Vec<Pr> {
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
#[tauri::command]
pub fn forge_checkout_pr(root: String, number: u64) -> Result<(), String> {
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
/// `body` is the assembled review summary. Best-effort; errors surface to the UI.
#[tauri::command]
pub fn forge_submit_review(
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
    let args: Vec<String> = match (cli, verdict) {
        ("gh", Verdict::Approve) => vec![
            "pr".into(),
            "review".into(),
            n,
            "--approve".into(),
            "-b".into(),
            body,
        ],
        ("gh", Verdict::RequestChanges) => {
            vec![
                "pr".into(),
                "review".into(),
                n,
                "--request-changes".into(),
                "-b".into(),
                body,
            ]
        }
        ("gh", Verdict::Comment) => vec![
            "pr".into(),
            "review".into(),
            n,
            "--comment".into(),
            "-b".into(),
            body,
        ],
        ("glab", Verdict::Approve) => vec!["mr".into(), "approve".into(), n],
        // glab has no request-changes verb; record the review as a note.
        ("glab", _) => vec!["mr".into(), "note".into(), n, "-m".into(), body],
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

#[cfg(test)]
mod tests {
    use super::*;

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
