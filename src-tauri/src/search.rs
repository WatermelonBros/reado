//! Full-text project search backed by ripgrep.
//!
//! We shell out to `rg --json` so results honour `.gitignore` for free and stay
//! fast on large repositories. The structured JSON stream is parsed into flat
//! match rows the frontend renders directly.

use std::path::Path;
use crate::proc::command;

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

/// Search `query` across `root` using ripgrep (smart-case, gitignore-aware).
///
/// `query` is interpreted as a ripgrep regex; ripgrep's smart-case rule makes it
/// case-insensitive unless the query contains an uppercase letter.
#[tauri::command]
pub fn search_text(root: String, query: String) -> Result<Vec<SearchMatch>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let output = match command("rg")
        .arg("--json")
        .arg("--smart-case")
        .arg("--max-count")
        .arg("100") // per-file cap; MAX_MATCHES bounds the overall total
        .arg(&query)
        .current_dir(Path::new(&root))
        .output()
    {
        Ok(out) => out,
        // No ripgrep on PATH — fall back to an in-process, gitignore-aware walk
        // so search still works (literal smart-case match, not regex).
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(search_fallback(&root, &query));
        }
        Err(e) => return Err(Error::Io(e)),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
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

    Ok(matches)
}

/// In-process search used when `rg` is unavailable. Walks `root` honouring
/// `.gitignore` and skipping hidden/VCS dirs (via the `ignore` crate), and finds
/// literal, smart-case matches line by line. Binary files (invalid UTF-8) are
/// skipped. Not a regex engine — just enough to keep search working everywhere.
fn search_fallback(root: &str, query: &str) -> Vec<SearchMatch> {
    let smart_case = query.chars().any(|c| c.is_uppercase());
    let needle = if smart_case {
        query.to_string()
    } else {
        query.to_lowercase()
    };

    let mut matches = Vec::new();
    for entry in ignore::WalkBuilder::new(root).build().flatten() {
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
            let hay = if smart_case {
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
pub fn replace_text(root: String, query: String, replacement: String) -> Result<usize> {
    if query.is_empty() {
        return Ok(0);
    }
    let mut changed = 0usize;
    for entry in ignore::WalkBuilder::new(&root).build().flatten() {
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
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_text_rewrites_literal_occurrences() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "foo bar foo\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "nothing\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let n = super::replace_text(root.into(), "foo".into(), "baz".into()).unwrap();
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
    fn fallback_finds_smart_case_matches() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "Hello world\nhello again\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "nothing here\n").unwrap();
        let root = dir.path().to_str().unwrap();

        // Lowercase query → case-insensitive: matches both "Hello" and "hello".
        let lower = search_fallback(root, "hello");
        assert_eq!(lower.len(), 2);

        // Query with an uppercase letter → case-sensitive: only "Hello world".
        let upper = search_fallback(root, "Hello");
        assert_eq!(upper.len(), 1);
        assert_eq!(upper[0].line, 1);
    }
}
