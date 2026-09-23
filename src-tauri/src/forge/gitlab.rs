//! GitLab, driven through `glab`.

use super::{
    cli_out, cli_out_result, run_verdict, ForgeCli, HostThread, Pr, ReviewComment, Verdict,
    MAX_PAGES,
};
use crate::proc::command;
use std::path::Path;
use std::process::Output;

pub(super) struct GitLab;

impl ForgeCli for GitLab {
    fn program(&self) -> &'static str {
        "glab"
    }

    fn origin(&self) -> &'static str {
        "gitlab"
    }

    fn list_prs(&self, root: &Path) -> Result<Vec<Pr>, String> {
        glab_list(root)
    }

    fn checkout_args(&self, number: u64) -> Vec<String> {
        vec!["mr".into(), "checkout".into(), number.to_string()]
    }

    fn base_branch(&self, root: &Path, number: u64) -> Option<String> {
        cli_out(
            root,
            "glab",
            &["mr", "view", &number.to_string(), "-F", "json"],
        )
        .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
        .and_then(|v| {
            v.get("target_branch")
                .and_then(|t| t.as_str())
                .map(str::to_string)
        })
    }

    fn head_refspec(&self, number: u64) -> String {
        format!("merge-requests/{number}/head:refs/reado/pr-{number}")
    }

    fn verdict_runs(&self, number: u64, verdict: Verdict, body: String) -> Vec<Vec<String>> {
        let n = number.to_string();
        match verdict {
            // `mr approve` carries no body, so we approve AND post the review
            // summary as a note — otherwise the session's content is silently
            // dropped on approve.
            Verdict::Approve => vec![
                vec!["mr".into(), "approve".into(), n.clone()],
                vec!["mr".into(), "note".into(), n, "-m".into(), body],
            ],
            // glab has no request-changes verb; record the review as a note.
            _ => vec![vec!["mr".into(), "note".into(), n, "-m".into(), body]],
        }
    }

    fn review_with_comments(
        &self,
        root: &Path,
        number: u64,
        verdict: Verdict,
        body: &str,
        comments: &[ReviewComment],
    ) -> Result<(), String> {
        glab_review_with_comments(root, number, verdict, body, comments)
    }

    fn threads(&self, root: &Path, number: u64) -> Vec<HostThread> {
        glab_all_threads(root, number)
    }

    fn resolve_thread(
        &self,
        root: &Path,
        number: u64,
        external_id: &str,
        resolved: bool,
    ) -> std::io::Result<Output> {
        command("glab")
            .current_dir(root)
            .args([
                "api",
                "--method",
                "PUT",
                &format!("projects/:id/merge_requests/{number}/discussions/{external_id}"),
                "-f",
                &format!("resolved={resolved}"),
            ])
            .output()
    }
}

fn glab_list(root: &Path) -> Result<Vec<Pr>, String> {
    let json = cli_out_result(root, "glab", &["mr", "list", "--output", "json"])?;
    parse_glab_prs(&json)
}

/// Parse `glab mr list --output json` into PRs. Split out for unit tests (see
/// [`super::github::parse_gh_prs`]).
pub(super) fn parse_glab_prs(json: &str) -> Result<Vec<Pr>, String> {
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
    run_verdict(&GitLab, root, number, verdict, &note)
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
