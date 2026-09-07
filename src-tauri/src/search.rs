//! Full-text project search backed by ripgrep.
//!
//! We shell out to `rg --json` so results honour `.gitignore` for free and stay
//! fast on large repositories. The structured JSON stream is parsed into flat
//! match rows the frontend renders directly.

use crate::proc::command;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::error::{Error, Result};

/// One matching line returned by a search.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    /// Absolute path of the file containing the match.
    pub path: String,
    /// 1-based line number.
    pub line: u64,
    /// 0-based byte offset of the first submatch within the line.
    pub column: u64,
    /// The full matching line, trimmed of its trailing newline.
    pub text: String,
}

/// Hard cap on returned matches to keep the results panel responsive.
const MAX_MATCHES: usize = 2000;

/// Resolve an optional project-relative folder to search in ("Find in Folder").
///
/// `None` (or an empty string) means the whole project. Anything else is
/// confined to `root` the same way every other path is — a scope is a filter the
/// user picked in the tree, never a way to read outside the project.
fn scope_dir(root: &str, scope: Option<String>) -> Result<Option<PathBuf>> {
    let Some(scope) = scope.filter(|s| !s.trim().is_empty()) else {
        return Ok(None);
    };
    let dir = crate::fs::ensure_within(Path::new(root), Path::new(&scope))?;
    if !dir.is_dir() {
        return Err(Error::Other("search scope is not a folder".into()));
    }
    Ok(Some(dir))
}

/// Search `query` across `root` using ripgrep (smart-case, gitignore-aware).
///
/// `query` is interpreted as a ripgrep regex; ripgrep's smart-case rule makes it
/// case-insensitive unless the query contains an uppercase letter.
#[tauri::command]
pub fn search_text(
    root: String,
    query: String,
    exclude: Vec<String>,
    case_sensitive: bool,
    whole_word: bool,
    regex: bool,
    scope: Option<String>,
) -> Result<Vec<SearchMatch>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let scope = scope_dir(&root, scope)?;

    let mut cmd = command("rg");
    cmd.arg("--json").arg("--max-count").arg("100"); // per-file cap; MAX_MATCHES bounds the total

    // Match VS Code's toggles: case sensitivity, whole-word, and literal-vs-regex.
    cmd.arg(if case_sensitive {
        "--case-sensitive"
    } else {
        "--ignore-case"
    });
    if whole_word {
        cmd.arg("--word-regexp");
    }
    if !regex {
        cmd.arg("--fixed-strings"); // literal search
    }
    if query.contains('\n') {
        cmd.arg("--multiline"); // let a pattern span lines (multi-line snippets)
    }

    // Exclude the user's globs (ripgrep glob is `!pattern` to negate/ignore).
    for g in &exclude {
        let g = g.trim();
        if !g.is_empty() {
            cmd.arg("-g").arg(format!("!{g}"));
        }
    }
    cmd.arg(&query);
    // The search path, when scoped. Passed as ripgrep's path argument (with the
    // cwd still at the root) so result paths keep the same shape as an unscoped
    // search — the frontend resolves them the same way either way.
    if let Some(dir) = &scope {
        cmd.arg(dir);
    }
    let output = match cmd.current_dir(Path::new(&root)).output() {
        Ok(out) => out,
        // No ripgrep on PATH — fall back to an in-process, gitignore-aware walk
        // (single-line, literal; honours case sensitivity only).
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let start = scope
                .as_ref()
                .map_or_else(|| root.clone(), |d| d.to_string_lossy().into_owned());
            return Ok(search_fallback(
                &root,
                &start,
                &query,
                &exclude,
                case_sensitive,
            ));
        }
        Err(e) => return Err(Error::Io(e)),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let matches = parse_rg_json(&stdout);

    crate::log::debug(
        "search",
        "search",
        serde_json::json!({ "queryLen": query.chars().count(), "matches": matches.len() }),
    );
    Ok(matches)
}

/// Parse ripgrep's `--json` event stream into flat match rows.
///
/// Pure over the captured stdout so it can be exercised directly. Keeps only
/// `type == "match"` events, extracting the file path, 1-based line number, the
/// trimmed matching line, and the first submatch's 0-based column. Non-match
/// events (`begin`/`end`/`summary`) and malformed JSON lines are skipped, and the
/// total is capped at `MAX_MATCHES`.
fn parse_rg_json(stdout: &str) -> Vec<SearchMatch> {
    let mut matches = Vec::new();

    for line in stdout.lines() {
        if matches.len() >= MAX_MATCHES {
            break;
        }
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) != Some("match") {
            continue;
        }
        let data = &event["data"];
        let Some(path) = data["path"]["text"].as_str() else {
            continue;
        };
        let line_number = data["line_number"].as_u64().unwrap_or(0);
        let text = data["lines"]["text"].as_str().unwrap_or("").trim_end();
        let column = data["submatches"][0]["start"].as_u64().unwrap_or(0);

        matches.push(SearchMatch {
            path: path.to_string(),
            line: line_number,
            column,
            text: text.to_string(),
        });
    }

    matches
}

/// In-process search used when `rg` is unavailable. Walks `root` honouring
/// `.gitignore` and skipping hidden/VCS dirs (via the `ignore` crate), and finds
/// literal, smart-case matches line by line. Binary files (invalid UTF-8) are
/// skipped. Not a regex engine — just enough to keep search working everywhere.
fn search_fallback(
    root: &str,
    start: &str,
    query: &str,
    exclude: &[String],
    case_sensitive: bool,
) -> Vec<SearchMatch> {
    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };

    // Walk from `start` (the scope, or the root) but build the overrides against
    // the root, so the user's exclude globs keep meaning the same thing.
    let mut walk = ignore::WalkBuilder::new(start);
    if let Some(ov) = crate::fs::exclude_overrides(&std::path::PathBuf::from(root), exclude) {
        walk.overrides(ov);
    }
    let mut matches = Vec::new();
    for entry in walk.build().flatten() {
        if matches.len() >= MAX_MATCHES {
            break;
        }
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue; // unreadable or binary
        };
        let mut per_file = 0;
        for (i, line) in content.lines().enumerate() {
            if per_file >= 100 || matches.len() >= MAX_MATCHES {
                break;
            }
            let hay = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if let Some(col) = hay.find(&needle) {
                matches.push(SearchMatch {
                    path: entry.path().to_string_lossy().into_owned(),
                    line: (i + 1) as u64,
                    column: col as u64,
                    text: line.trim_end().to_string(),
                });
                per_file += 1;
            }
        }
    }
    matches
}

/// Replace every literal occurrence of `query` with `replacement` across the
/// project (gitignore-aware, text files only). Case-sensitive and literal — not
/// a regex — so a project-wide replace can't misfire on regex metacharacters.
/// Returns the number of files changed.
#[tauri::command]
pub fn replace_text(
    root: String,
    query: String,
    replacement: String,
    exclude: Vec<String>,
    scope: Option<String>,
) -> Result<usize> {
    if query.is_empty() {
        return Ok(0);
    }
    // Scoped replace rewrites exactly what a scoped search would have found:
    // showing results for one folder and rewriting the whole project would be a
    // trap, not a feature.
    let scope = scope_dir(&root, scope)?;
    let start = scope
        .as_ref()
        .map_or_else(|| root.clone(), |d| d.to_string_lossy().into_owned());
    let mut changed = 0usize;
    let mut walk = ignore::WalkBuilder::new(&start);
    // Honor the user's exclude-from-tree/search globs, matching `search_text` — a
    // project-wide rewrite must not touch files the user has hidden from search.
    if let Some(ov) = crate::fs::exclude_overrides(&std::path::PathBuf::from(&root), &exclude) {
        walk.overrides(ov);
    }
    for entry in walk.build().flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        let Ok(content) = std::fs::read_to_string(path) else {
            continue; // unreadable or binary
        };
        if !content.contains(&query) {
            continue;
        }
        let updated = content.replace(&query, &replacement);
        if updated != content {
            std::fs::write(path, updated)?;
            changed += 1;
        }
    }
    crate::log::info(
        "search",
        "replace",
        serde_json::json!({ "queryLen": query.chars().count(), "filesChanged": changed }),
    );
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blank_query_searches_nothing() {
        // Clearing the search box must not fire `rg ""`, which matches every
        // line of every file and walks the whole tree.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "anything\n").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        for q in ["", "   ", "\t\n"] {
            let hits =
                search_text(root.clone(), q.into(), vec![], false, false, false, None).unwrap();
            assert!(
                hits.is_empty(),
                "blank query {q:?} returned {} hits",
                hits.len()
            );
        }
    }

    #[test]
    fn replace_text_rewrites_literal_occurrences() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "foo bar foo\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "nothing\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let n = super::replace_text(root.into(), "foo".into(), "baz".into(), vec![], None).unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "baz bar baz\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "nothing\n"
        );
    }

    #[test]
    fn replace_text_skips_excluded_globs() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("keep.txt"), "foo\n").unwrap();
        std::fs::write(dir.path().join("skip.log"), "foo\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let n = super::replace_text(
            root.into(),
            "foo".into(),
            "baz".into(),
            vec!["*.log".into()],
            None,
        )
        .unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("keep.txt")).unwrap(),
            "baz\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("skip.log")).unwrap(),
            "foo\n"
        );
    }

    #[test]
    fn parse_rg_json_extracts_match_rows() {
        let stdout = concat!(
            r#"{"type":"begin","data":{"path":{"text":"a.rs"}}}"#,
            "\n",
            r#"{"type":"match","data":{"path":{"text":"a.rs"},"line_number":12,"lines":{"text":"foo\n"},"submatches":[{"start":4}]}}"#,
            "\n",
            r#"{"type":"match","data":{"path":{"text":"b.rs"},"line_number":3,"lines":{"text":"    bar baz\n"},"submatches":[{"start":8}]}}"#,
            "\n",
            r#"{"type":"end","data":{"path":{"text":"a.rs"}}}"#,
            "\n",
            r#"{"type":"summary","data":{"stats":{"matched_lines":2}}}"#,
            "\n",
        );

        let matches = parse_rg_json(stdout);
        assert_eq!(matches.len(), 2);

        assert_eq!(matches[0].path, "a.rs");
        assert_eq!(matches[0].line, 12);
        assert_eq!(matches[0].column, 4);
        // Trailing newline is trimmed off the reported line.
        assert_eq!(matches[0].text, "foo");

        assert_eq!(matches[1].path, "b.rs");
        assert_eq!(matches[1].line, 3);
        assert_eq!(matches[1].column, 8);
        assert_eq!(matches[1].text, "    bar baz");
    }

    #[test]
    fn parse_rg_json_skips_non_match_and_malformed_lines() {
        let stdout = concat!(
            "not json at all\n",
            r#"{"type":"begin","data":{"path":{"text":"a.rs"}}}"#,
            "\n",
            r#"{"type":"summary","data":{}}"#,
            "\n",
            "{ broken json\n",
            r#"{"type":"match","data":{"path":{"text":"only.rs"},"line_number":1,"lines":{"text":"hit\n"},"submatches":[{"start":0}]}}"#,
            "\n",
        );

        let matches = parse_rg_json(stdout);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "only.rs");
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[0].column, 0);
        assert_eq!(matches[0].text, "hit");
    }

    #[test]
    fn parse_rg_json_respects_max_matches_cap() {
        // Emit well past the cap; parsing must stop at MAX_MATCHES.
        let mut stdout = String::new();
        for i in 0..(MAX_MATCHES + 500) {
            stdout.push_str(&format!(
                r#"{{"type":"match","data":{{"path":{{"text":"f.rs"}},"line_number":{i},"lines":{{"text":"x\n"}},"submatches":[{{"start":0}}]}}}}"#
            ));
            stdout.push('\n');
        }

        let matches = parse_rg_json(&stdout);
        assert_eq!(matches.len(), MAX_MATCHES);
    }

    #[test]
    fn a_scoped_replace_leaves_the_rest_of_the_project_alone() {
        // The trap this closes: results shown for one folder, a rewrite applied
        // to the whole project.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/a.txt"), "foo\n").unwrap();
        std::fs::write(dir.path().join("outside.txt"), "foo\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let n = super::replace_text(
            root.into(),
            "foo".into(),
            "baz".into(),
            vec![],
            Some("src".into()),
        )
        .unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("src/a.txt")).unwrap(),
            "baz\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("outside.txt")).unwrap(),
            "foo\n"
        );
    }

    #[test]
    fn a_scope_cannot_escape_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let root = root.to_str().unwrap();
        assert!(super::scope_dir(root, Some("..".into())).is_err());
        assert!(super::scope_dir(root, Some("../..".into())).is_err());
        // Absent and blank both mean "the whole project", not an error.
        assert!(super::scope_dir(root, None).unwrap().is_none());
        assert!(super::scope_dir(root, Some("  ".into())).unwrap().is_none());
    }

    #[test]
    fn the_fallback_walk_honours_the_scope_too() {
        // rg may not be installed; the fallback must scope the same way or the
        // results silently differ by machine.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/a.txt"), "hello\n").unwrap();
        std::fs::write(dir.path().join("outside.txt"), "hello\n").unwrap();
        let root = dir.path().to_str().unwrap();
        let scoped = dir.path().join("src");

        let all = search_fallback(root, root, "hello", &[], false);
        assert_eq!(all.len(), 2);
        let only_src = search_fallback(root, scoped.to_str().unwrap(), "hello", &[], false);
        assert_eq!(only_src.len(), 1);
    }

    #[test]
    fn fallback_finds_smart_case_matches() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "Hello world\nhello again\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "nothing here\n").unwrap();
        let root = dir.path().to_str().unwrap();

        // Case-insensitive: matches both "Hello" and "hello".
        let lower = search_fallback(root, root, "hello", &[], false);
        assert_eq!(lower.len(), 2);

        // Case-sensitive: only "Hello world".
        let upper = search_fallback(root, root, "Hello", &[], true);
        assert_eq!(upper.len(), 1);
        assert_eq!(upper[0].line, 1);
    }
}
