use super::{run_git, run_git_raw};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

use serde::Serialize;
use tauri::State;

/// Blame attribution for one line of a file.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    /// 1-based final line number.
    pub line: u32,
    /// Abbreviated commit hash (8 chars); all-zero for not-yet-committed lines.
    pub hash: String,
    pub author: String,
    /// Author time as a Unix timestamp (seconds).
    pub time: i64,
    /// First line of the commit message.
    pub summary: String,
}

/// A cached blame result, valid while the file's HEAD and mtime are unchanged.
struct CachedBlame {
    head: String,
    mtime: Option<SystemTime>,
    lines: Vec<BlameLine>,
}

/// Per-(root, file) blame cache so toggling blame on/off or re-opening a file
/// doesn't re-run `git blame`; an entry is invalidated when HEAD or the file's
/// mtime changes.
#[derive(Default)]
pub struct BlameCache(Mutex<HashMap<String, CachedBlame>>);

/// Cap the blame cache so it can't grow unbounded across a long session over
/// many files (each entry holds one BlameLine per source line).
const BLAME_CACHE_MAX: usize = 64;

/// Per-line blame for a tracked file (`git blame --line-porcelain`). Returns an
/// empty list when git is unavailable or the file is untracked. Lazy: only the
/// frontend (blame mode on) calls it, and results are cached per (file, HEAD).
#[tauri::command]
pub fn git_blame(cache: State<BlameCache>, root: String, file: String) -> Vec<BlameLine> {
    let key = format!("{root}\u{0}{file}");
    let head = run_git(Path::new(&root), &["rev-parse", "HEAD"]).unwrap_or_default();
    let mtime = std::fs::metadata(Path::new(&root).join(&file))
        .and_then(|m| m.modified())
        .ok();

    // Cache hit: same HEAD and same file mtime → reuse.
    if let Ok(map) = cache.0.lock() {
        if let Some(hit) = map.get(&key) {
            if hit.head == head && hit.mtime == mtime {
                return hit.lines.clone();
            }
        }
    }

    let Some(out) = run_git_raw(
        Path::new(&root),
        &["blame", "--line-porcelain", "--", &file],
    ) else {
        return Vec::new();
    };

    let lines = parse_blame_porcelain(&out);

    if let Ok(mut map) = cache.0.lock() {
        // ponytail: clear-all eviction at the cap — blame recomputes lazily on the
        // next request. A real LRU only if blame churn ever proves it matters.
        if map.len() >= BLAME_CACHE_MAX {
            map.clear();
        }
        map.insert(
            key,
            CachedBlame {
                head,
                mtime,
                lines: lines.clone(),
            },
        );
    }
    lines
}

/// De-serialise `git blame --line-porcelain` into one `BlameLine` per source
/// line. The porcelain groups each line as: a commit header
/// `"<40-hex-hash> <orig-line> <final-line> [count]"`, then `author`,
/// `author-time`, `summary` (and other) fields, terminated by the `\t<content>`
/// line — that terminator is what emits a `BlameLine`. Header fields carry
/// forward across lines that share a commit (git omits them after the first).
/// The hash is abbreviated to 8 chars; a header whose first token isn't ≥8 hex
/// digits is ignored, keeping the previous commit's fields. Pure so it can be
/// unit-tested without spawning git.
fn parse_blame_porcelain(out: &str) -> Vec<BlameLine> {
    let mut lines = Vec::new();
    let (mut hash, mut author, mut summary) = (String::new(), String::new(), String::new());
    let (mut time, mut final_line) = (0i64, 0u32);
    for l in out.lines() {
        if let Some(content) = l.strip_prefix('\t') {
            let _ = content; // the source line itself is not needed
            lines.push(BlameLine {
                line: final_line,
                hash: hash.chars().take(8).collect(),
                author: author.clone(),
                time,
                summary: summary.clone(),
            });
        } else if let Some(rest) = l.strip_prefix("author ") {
            author = rest.to_string();
        } else if let Some(rest) = l.strip_prefix("author-time ") {
            time = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = l.strip_prefix("summary ") {
            summary = rest.to_string();
        } else {
            // Commit header: "<40-hex-hash> <orig-line> <final-line> [count]".
            let mut it = l.split(' ');
            if let Some(h) = it.next() {
                if h.len() >= 8 && h.bytes().all(|b| b.is_ascii_hexdigit()) {
                    hash = h.to_string();
                    it.next(); // original line
                    if let Some(fl) = it.next() {
                        final_line = fl.parse().unwrap_or(final_line);
                    }
                }
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_blame_porcelain() {
        // Two source lines, both from one commit: the header + author/
        // author-time/summary fields appear once, then each `\t<content>` line
        // terminates a BlameLine (git omits the repeated fields for line 2, so
        // they must carry forward).
        let out = "\
0a1b2c3d4e5f60718293a4b5c6d7e8f901234567 1 1 2
author Ada Lovelace
author-mail <ada@example.com>
author-time 1700000000
author-tz +0000
summary Add the analytical engine
filename src/engine.rs
\tfirst line of content
0a1b2c3d4e5f60718293a4b5c6d7e8f901234567 2 2
\tsecond line of content";
        let lines = parse_blame_porcelain(out);
        assert_eq!(lines.len(), 2);

        assert_eq!(lines[0].hash, "0a1b2c3d");
        assert_eq!(lines[0].hash.len(), 8);
        assert_eq!(lines[0].author, "Ada Lovelace");
        assert_eq!(lines[0].time, 1_700_000_000);
        assert_eq!(lines[0].summary, "Add the analytical engine");
        assert_eq!(lines[0].line, 1);

        // Line 2 reuses the carried-forward commit fields, with its own line no.
        assert_eq!(lines[1].hash, "0a1b2c3d");
        assert_eq!(lines[1].author, "Ada Lovelace");
        assert_eq!(lines[1].time, 1_700_000_000);
        assert_eq!(lines[1].summary, "Add the analytical engine");
        assert_eq!(lines[1].line, 2);
    }
}
