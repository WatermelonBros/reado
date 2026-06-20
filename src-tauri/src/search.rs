//! Full-text project search backed by ripgrep.
//!
//! We shell out to `rg --json` so results honour `.gitignore` for free and stay
//! fast on large repositories. The structured JSON stream is parsed into flat
//! match rows the frontend renders directly.

use std::path::Path;
use std::process::Command;

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
// ponytail: assumes `rg` on PATH. For distributed builds, bundle the binary and
// resolve it via the sidecar path instead of relying on the user's environment.
#[tauri::command]
pub fn search_text(root: String, query: String) -> Result<Vec<SearchMatch>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let output = Command::new("rg")
        .arg("--json")
        .arg("--smart-case")
        .arg("--max-count")
        .arg("100") // per-file cap; MAX_MATCHES bounds the overall total
        .arg(&query)
        .current_dir(Path::new(&root))
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                Error::RipgrepMissing
            } else {
                Error::Io(e)
            }
        })?;

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
