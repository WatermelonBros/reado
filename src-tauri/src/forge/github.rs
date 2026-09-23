//! GitHub, driven through `gh`.

use super::{cli_out, cli_out_result, ForgeCli, HostThread, Pr, ReviewComment, Verdict, MAX_PAGES};
use crate::proc::command;
use std::io::Write;
use std::path::Path;
use std::process::{Output, Stdio};

pub(super) struct GitHub;

impl ForgeCli for GitHub {
    fn program(&self) -> &'static str {
        "gh"
    }

    fn origin(&self) -> &'static str {
        "github"
    }

    fn list_prs(&self, root: &Path) -> Result<Vec<Pr>, String> {
        gh_list(root)
    }

    fn checkout_args(&self, number: u64) -> Vec<String> {
        vec!["pr".into(), "checkout".into(), number.to_string()]
    }

    fn base_branch(&self, root: &Path, number: u64) -> Option<String> {
        cli_out(
            root,
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
        )
    }

    fn head_refspec(&self, number: u64) -> String {
        format!("pull/{number}/head:refs/reado/pr-{number}")
    }

    fn verdict_runs(&self, number: u64, verdict: Verdict, body: String) -> Vec<Vec<String>> {
        let flag = match verdict {
            Verdict::Approve => "--approve",
            Verdict::RequestChanges => "--request-changes",
            Verdict::Comment => "--comment",
        };
        vec![vec![
            "pr".into(),
            "review".into(),
            number.to_string(),
            flag.into(),
            "-b".into(),
            body,
        ]]
    }

    fn review_with_comments(
        &self,
        root: &Path,
        number: u64,
        verdict: Verdict,
        body: &str,
        comments: &[ReviewComment],
    ) -> Result<(), String> {
        gh_review_with_comments(root, number, verdict, body, comments)
    }

    fn threads(&self, root: &Path, number: u64) -> Vec<HostThread> {
        gh_all_threads(root, number)
    }

    fn resolve_thread(
        &self,
        root: &Path,
        _number: u64,
        external_id: &str,
        resolved: bool,
    ) -> std::io::Result<Output> {
        let mutation = if resolved {
            "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}"
        } else {
            "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id}}}"
        };
        command("gh")
            .current_dir(root)
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
pub(super) fn parse_gh_prs(json: &str) -> Result<Vec<Pr>, String> {
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
}
