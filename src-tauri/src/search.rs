//! Full-text project search backed by ripgrep.
//!
//! We shell out to `rg --json` so results honour `.gitignore` for free and stay
//! fast on large repositories. The structured JSON stream is parsed into flat
//! match rows the frontend renders directly.

use crate::proc::command;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
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
// The arguments are the search panel's own controls, one per toggle/field. A
// struct would only move the same list behind a name the JS side would then have
// to build, so they stay flat, as they are on the wire.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn search_text(
    root: String,
    query: String,
    exclude: Vec<String>,
    include: Vec<String>,
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

    // "Files to include" narrows the search to matching paths; the exclude list
    // widens the ignore rules (ripgrep glob is `!pattern` to negate).
    for g in &include {
        let g = g.trim();
        if !g.is_empty() {
            cmd.arg("-g").arg(g);
        }
    }
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
                &include,
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
    include: &[String],
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
    if let Some(ov) = crate::fs::glob_overrides(&std::path::PathBuf::from(root), include, exclude) {
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

/// One file's pre-replace content, parked so the rewrite can be undone.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// The file that was rewritten.
    pub path: String,
    /// Where its previous content is parked (inside `.reado/.undo/`).
    pub backup: String,
}

/// What a replace did, and how to take it back.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    pub changed: usize,
    pub backups: Vec<Backup>,
}

/// Rewrite one project file under the backup contract.
///
/// `rewrite` gets the current content and returns the new one, or `None` for
/// "nothing to do". Everything around it — confining the path to the project,
/// parking a copy for undo, writing — is the same ritual for every bulk write,
/// and was written out three times before this existed.
fn rewrite_backed_up(
    root: &str,
    path: &str,
    rewrite: impl FnOnce(&str) -> Option<String>,
) -> Result<ReplaceResult> {
    let root_path = std::path::PathBuf::from(root);
    let target = crate::fs::ensure_within(&root_path, &std::path::PathBuf::from(path))?;
    let content = std::fs::read_to_string(&target)?;
    let Some(updated) = rewrite(&content) else {
        return Ok(ReplaceResult::default());
    };
    prune_undo(&root_path.join(".reado").join(".undo"));
    let backups = vec![park_backup(&root_path, &target)?];
    std::fs::write(&target, updated)?;
    Ok(ReplaceResult {
        changed: 1,
        backups,
    })
}

/// Write `content` over a project file, parking a copy for undo first.
///
/// The door language-server workspace edits go through, so a cross-file rename
/// is one undoable action like every other bulk rewrite.
#[tauri::command]
pub fn write_backed(
    root: String,
    path: String,
    content: String,
    encoding: Option<String>,
) -> Result<ReplaceResult> {
    let result = rewrite_backed_up(&root, &path, |current| {
        (current != content).then(|| content.clone())
    })?;
    // Re-encode through the normal write path so a non-UTF-8 file keeps its
    // charset; the backup above is what makes that safe to do in two steps.
    if result.changed > 0 {
        crate::fs::write_file(root, path, content, encoding)?;
    }
    Ok(result)
}

/// How long a parked copy is kept.
///
/// A window rather than a count: one Replace All parks a copy of every file it
/// touches, and trimming to "the newest N" would delete the backups of the very
/// operation still sitting at the top of the undo stack. Nothing can reach a
/// week-old parked copy — the stack holds 50 operations and does not survive
/// that long in practice — so age is the safe axis.
const UNDO_RETENTION_NANOS: u128 = 7 * 24 * 60 * 60 * 1_000_000_000;

/// Nanoseconds since the epoch, or 0 if the clock is before it.
fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
}

/// Drop parked copies too old for any undo to still reach them.
///
/// Nothing ever removed these: every Replace All, every language-server rename
/// and every bulk write left a full copy of each file it touched behind for
/// good, so `.reado/.undo/` grew for the life of the project and was never read
/// again. Best-effort throughout — a backup that can't be deleted is not a
/// reason to fail the write it is protecting.
fn prune_undo(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let cutoff = now_nanos().saturating_sub(UNDO_RETENTION_NANOS);
    for entry in entries.flatten() {
        let name = entry.file_name();
        // Only files this parked, and only ones we can date: the name is
        // `{nanos}__{original}`. Anything else was put there by someone else.
        let Some(stamp) = name
            .to_string_lossy()
            .split_once("__")
            .and_then(|(stamp, _)| stamp.parse::<u128>().ok())
        else {
            continue;
        };
        if stamp < cutoff {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Park `path`'s current content under `.reado/.undo/` and return the pair.
///
/// A copy, not a rename: the file is about to be rewritten in place, and every
/// editor tab, watcher and inode reference pointing at it has to keep working.
fn park_backup(root: &Path, path: &Path) -> Result<Backup> {
    let dir = root.join(".reado").join(".undo");
    std::fs::create_dir_all(&dir)?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let stamp = now_nanos();
    let dest = crate::fs::unique_dest(&dir.join(format!("{stamp}__{name}")));
    std::fs::copy(path, &dest)?;
    Ok(Backup {
        path: path.to_string_lossy().into_owned(),
        backup: dest.to_string_lossy().into_owned(),
    })
}

/// Rewrite `content`, replacing `query` with `replacement`.
///
/// With `positions` empty, every occurrence goes. Otherwise only the occurrences
/// that start at one of the given 1-based (line, column) pairs — which is what
/// "replace this one result" means, and why the search panel sends the position
/// of the row you clicked rather than an occurrence index.
fn replace_in_text(
    content: &str,
    query: &str,
    replacement: &str,
    positions: &[(u64, u64)],
) -> Option<String> {
    if positions.is_empty() {
        let updated = content.replace(query, replacement);
        return (updated != *content).then_some(updated);
    }
    let wanted: std::collections::HashSet<(u64, u64)> = positions.iter().copied().collect();
    let mut out = String::with_capacity(content.len());
    let mut changed = false;
    // Line endings are preserved by splitting on '\n' and re-joining: a CRLF file
    // keeps its '\r' as the last character of each line's content.
    for (i, line) in content.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let line_no = (i + 1) as u64;
        let mut col = 1u64;
        let mut rest = line;
        while let Some(at) = rest.find(query) {
            let before = &rest[..at];
            out.push_str(before);
            let start_col = col + before.chars().count() as u64;
            if wanted.contains(&(line_no, start_col)) {
                out.push_str(replacement);
                changed = true;
            } else {
                out.push_str(query);
            }
            col = start_col + query.chars().count() as u64;
            rest = &rest[at + query.len()..];
        }
        out.push_str(rest);
    }
    changed.then_some(out)
}

/// Replace every literal occurrence of `query` with `replacement` across the
/// project (gitignore-aware, text files only). Case-sensitive and literal — not
/// a regex — so a project-wide replace can't misfire on regex metacharacters.
///
/// Every file it rewrites is backed up first, so the whole batch is one
/// undoable action rather than forty irreversible writes.
#[tauri::command]
pub fn replace_text(
    root: String,
    query: String,
    replacement: String,
    exclude: Vec<String>,
    scope: Option<String>,
) -> Result<ReplaceResult> {
    let mut result = ReplaceResult::default();
    if query.is_empty() {
        return Ok(result);
    }
    // Scoped replace rewrites exactly what a scoped search would have found:
    // showing results for one folder and rewriting the whole project would be a
    // trap, not a feature.
    let scope = scope_dir(&root, scope)?;
    let start = scope
        .as_ref()
        .map_or_else(|| root.clone(), |d| d.to_string_lossy().into_owned());
    let root_path = std::path::PathBuf::from(&root);
    // Once for the whole walk: this parks a copy per matching file, and sweeping
    // the directory again for each of them would be quadratic.
    prune_undo(&root_path.join(".reado").join(".undo"));
    let mut walk = ignore::WalkBuilder::new(&start);
    // Honor the user's exclude-from-tree/search globs, matching `search_text` — a
    // project-wide rewrite must not touch files the user has hidden from search.
    if let Some(ov) = crate::fs::exclude_overrides(&root_path, &exclude) {
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
        let Some(updated) = replace_in_text(&content, &query, &replacement, &[]) else {
            continue;
        };
        result.backups.push(park_backup(&root_path, path)?);
        std::fs::write(path, updated)?;
        result.changed += 1;
    }
    crate::log::info(
        "search",
        "replace",
        serde_json::json!({ "queryLen": query.chars().count(), "filesChanged": result.changed }),
    );
    Ok(result)
}

/// Replace occurrences inside a single file: all of them, or only the ones at
/// the given 1-based (line, column) positions.
///
/// This is what "Replace" on one search result runs. Backed up like the
/// project-wide replace, so a single-match rewrite is just as undoable.
#[tauri::command]
pub fn replace_in_file(
    root: String,
    path: String,
    query: String,
    replacement: String,
    positions: Vec<(u64, u64)>,
) -> Result<ReplaceResult> {
    if query.is_empty() {
        return Ok(ReplaceResult::default());
    }
    rewrite_backed_up(&root, &path, |content| {
        replace_in_text(content, &query, &replacement, &positions)
    })
}

/// One whole-line rewrite: a 1-based line number and its new text.
#[derive(Debug, Deserialize)]
pub struct LineEdit {
    pub line: u64,
    pub text: String,
}

/// Rewrite whole lines of one file, by line number.
///
/// This is what "edit the search results and apply" writes back: the results
/// view shows one source line per row, so an applied change is exactly a set of
/// line replacements. Backed up first, like every other bulk write, so ⌘Z takes
/// the whole thing back.
///
/// A line number past the end of the file is skipped rather than appended: the
/// results were captured from an earlier read, and the file may have shrunk.
#[tauri::command]
pub fn write_lines(root: String, path: String, edits: Vec<LineEdit>) -> Result<ReplaceResult> {
    if edits.is_empty() {
        return Ok(ReplaceResult::default());
    }
    rewrite_backed_up(&root, &path, |content| {
        let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
        let mut touched = false;
        for edit in &edits {
            let Some(index) = (edit.line as usize).checked_sub(1) else {
                continue;
            };
            let Some(slot) = lines.get_mut(index) else {
                continue;
            };
            // A CRLF file carries its '\r' as the last character of the line; the
            // replacement text comes from the results view without one, so put it
            // back rather than converting the file's endings by accident.
            let next = if slot.ends_with('\r') {
                format!("{}\r", edit.text)
            } else {
                edit.text.clone()
            };
            if *slot != next {
                *slot = next;
                touched = true;
            }
        }
        touched.then(|| lines.join("\n"))
    })
}

/// Put parked content back — the undo of a replace. Each backup is moved (not
/// copied) back over its file, so undoing twice can't half-restore anything.
#[tauri::command]
pub fn restore_backups(root: String, backups: Vec<Backup>) -> Result<usize> {
    let root_path = std::path::PathBuf::from(&root);
    let mut restored = 0usize;
    for b in &backups {
        let target = crate::fs::ensure_within(&root_path, &std::path::PathBuf::from(&b.path))?;
        let parked = crate::fs::ensure_within(&root_path, &std::path::PathBuf::from(&b.backup))?;
        if !parked.exists() {
            continue;
        }
        std::fs::copy(&parked, &target)?;
        let _ = std::fs::remove_file(&parked);
        restored += 1;
    }
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A parked copy named as `park_backup` names them, dated `age_days` ago.
    fn park(dir: &Path, age_days: u128, name: &str) -> std::path::PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let stamp = now_nanos().saturating_sub(age_days * 24 * 60 * 60 * 1_000_000_000);
        let path = dir.join(format!("{stamp}__{name}"));
        std::fs::write(&path, "parked").unwrap();
        path
    }

    #[test]
    fn pruning_drops_the_unreachable_copies_and_keeps_the_rest() {
        // Undo parks a full copy of every file it rewrites. Nothing removed
        // them, so `.reado/.undo/` grew for the life of the project.
        let dir = tempfile::tempdir().unwrap();
        let undo = dir.path().join(".reado").join(".undo");
        let stale = park(&undo, 30, "old.ts");
        let edge = park(&undo, 8, "edge.ts");
        let fresh = park(&undo, 1, "new.ts");
        prune_undo(&undo);
        assert!(!stale.exists(), "a month-old copy is unreachable");
        assert!(!edge.exists(), "past the window");
        assert!(fresh.exists(), "yesterday's undo must still work");
    }

    #[test]
    fn pruning_leaves_alone_anything_it_did_not_park() {
        // The directory is inside the user's project. A file we can't date is a
        // file we didn't write, and deleting it is not ours to do.
        let dir = tempfile::tempdir().unwrap();
        let undo = dir.path().join(".reado").join(".undo");
        std::fs::create_dir_all(&undo).unwrap();
        let foreign = undo.join("notes.md");
        let unparsable = undo.join("banana__a.ts");
        std::fs::write(&foreign, "x").unwrap();
        std::fs::write(&unparsable, "x").unwrap();
        prune_undo(&undo);
        assert!(foreign.exists());
        assert!(unparsable.exists());
    }

    #[test]
    fn pruning_a_project_that_has_never_undone_anything_is_a_no_op() {
        let dir = tempfile::tempdir().unwrap();
        prune_undo(&dir.path().join(".reado").join(".undo"));
    }

    #[test]
    fn a_replace_prunes_but_keeps_the_backup_it_just_made() {
        // The sweep runs before the copy is parked; it must not be able to take
        // the new one with it.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        let undo = dir.path().join(".reado").join(".undo");
        let stale = park(&undo, 30, "old.ts");

        let result = replace_in_file(
            root,
            dir.path().join("a.txt").to_string_lossy().into_owned(),
            "one".into(),
            "two".into(),
            vec![],
        )
        .unwrap();

        assert_eq!(result.changed, 1);
        assert!(!stale.exists(), "the month-old copy went");
        let parked = &result.backups[0].backup;
        assert!(
            std::path::Path::new(parked).exists(),
            "undo still has what it needs"
        );
        assert_eq!(std::fs::read_to_string(parked).unwrap(), "one\n");
    }

    #[test]
    fn a_blank_query_searches_nothing() {
        // Clearing the search box must not fire `rg ""`, which matches every
        // line of every file and walks the whole tree.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "anything\n").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        for q in ["", "   ", "\t\n"] {
            let hits = search_text(
                root.clone(),
                q.into(),
                vec![],
                vec![],
                false,
                false,
                false,
                None,
            )
            .unwrap();
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

        let n = super::replace_text(root.into(), "foo".into(), "baz".into(), vec![], None)
            .unwrap()
            .changed;
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
        .unwrap()
        .changed;
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
    fn replace_in_text_takes_only_the_positions_it_is_given() {
        // "Replace this one result" means the occurrence the row points at, not
        // the nth one — two matches on the same line must be distinguishable.
        let doc = "a foo b foo\nfoo\n";
        let one = super::replace_in_text(doc, "foo", "X", &[(1, 9)]).unwrap();
        assert_eq!(one, "a foo b X\nfoo\n");
        let other = super::replace_in_text(doc, "foo", "X", &[(1, 3)]).unwrap();
        assert_eq!(other, "a X b foo\nfoo\n");
        let second_line = super::replace_in_text(doc, "foo", "X", &[(2, 1)]).unwrap();
        assert_eq!(second_line, "a foo b foo\nX\n");
    }

    #[test]
    fn replace_in_text_takes_every_occurrence_when_given_no_positions() {
        assert_eq!(
            super::replace_in_text("foo foo", "foo", "X", &[]).unwrap(),
            "X X"
        );
    }

    #[test]
    fn replace_in_text_reports_nothing_to_do() {
        assert!(super::replace_in_text("bar", "foo", "X", &[]).is_none());
        // A position that doesn't land on an occurrence changes nothing.
        assert!(super::replace_in_text("a foo", "foo", "X", &[(1, 1)]).is_none());
    }

    #[test]
    fn replace_in_text_keeps_crlf_endings() {
        // Lines are split on '\n', so the '\r' rides along as part of the line.
        assert_eq!(
            super::replace_in_text("foo\r\nfoo\r\n", "foo", "X", &[(2, 1)]).unwrap(),
            "foo\r\nX\r\n"
        );
    }

    #[test]
    fn a_replace_can_be_taken_back() {
        // The whole point of the backups: a project-wide rewrite is one undoable
        // action, not forty irreversible writes.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "foo\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "foo\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let res =
            super::replace_text(root.into(), "foo".into(), "baz".into(), vec![], None).unwrap();
        assert_eq!(res.changed, 2);
        assert_eq!(res.backups.len(), 2);

        let restored = super::restore_backups(root.into(), res.backups).unwrap();
        assert_eq!(restored, 2);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "foo\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("b.txt")).unwrap(),
            "foo\n"
        );
    }

    #[test]
    fn replacing_in_one_file_backs_it_up_too() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "foo foo\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let res = super::replace_in_file(
            root.into(),
            file.to_string_lossy().into_owned(),
            "foo".into(),
            "X".into(),
            vec![(1, 1)],
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "X foo\n");
        super::restore_backups(root.into(), res.backups).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "foo foo\n");
    }

    #[test]
    fn replacing_cannot_reach_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let outside = dir.path().join("secret.txt");
        std::fs::write(&outside, "foo\n").unwrap();

        assert!(super::replace_in_file(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
            "foo".into(),
            "X".into(),
            vec![],
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "foo\n");
    }

    #[test]
    fn a_backed_write_is_undoable_and_confined() {
        // The door LSP workspace edits go through: a cross-file rename was the
        // one bulk write in the app that ⌘Z could not take back.
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "old\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let res = super::write_backed(
            root.into(),
            file.to_string_lossy().into_owned(),
            "new\n".into(),
            None,
        )
        .unwrap();
        assert_eq!(res.changed, 1);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "new\n");
        super::restore_backups(root.into(), res.backups).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "old\n");
    }

    #[test]
    fn a_backed_write_of_identical_content_does_nothing() {
        // No change, no backup: an unchanged file must not push an empty undo
        // entry or leave a copy behind in `.reado/.undo/`.
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "same\n").unwrap();
        let res = super::write_backed(
            dir.path().to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            "same\n".into(),
            None,
        )
        .unwrap();
        assert_eq!(res.changed, 0);
        assert!(res.backups.is_empty());
    }

    #[test]
    fn a_backed_write_cannot_reach_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let outside = dir.path().join("secret.txt");
        std::fs::write(&outside, "safe\n").unwrap();
        assert!(super::write_backed(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
            "pwned".into(),
            None,
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "safe\n");
    }

    #[test]
    fn writing_lines_replaces_them_by_number_and_can_be_undone() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "one\ntwo\nthree\n").unwrap();
        let root = dir.path().to_str().unwrap();

        let res = super::write_lines(
            root.into(),
            file.to_string_lossy().into_owned(),
            vec![super::LineEdit {
                line: 2,
                text: "TWO".into(),
            }],
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "one\nTWO\nthree\n");
        super::restore_backups(root.into(), res.backups).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "one\ntwo\nthree\n");
    }

    #[test]
    fn writing_lines_keeps_crlf_endings() {
        // The results view hands back a line with no '\r'; converting the file's
        // endings as a side effect of one edit would be a whole-file diff.
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "one\r\ntwo\r\n").unwrap();
        super::write_lines(
            dir.path().to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            vec![super::LineEdit {
                line: 1,
                text: "ONE".into(),
            }],
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "ONE\r\ntwo\r\n");
    }

    #[test]
    fn a_line_past_the_end_is_skipped_rather_than_appended() {
        // The results were captured from an earlier read; the file may have
        // shrunk since, and inventing lines at the end would be worse than
        // dropping the edit.
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "one\n").unwrap();
        let res = super::write_lines(
            dir.path().to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            vec![super::LineEdit {
                line: 99,
                text: "nope".into(),
            }],
        )
        .unwrap();
        assert_eq!(res.changed, 0);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "one\n");
    }

    #[test]
    fn writing_lines_cannot_reach_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("proj");
        std::fs::create_dir(&root).unwrap();
        let outside = dir.path().join("secret.txt");
        std::fs::write(&outside, "safe\n").unwrap();
        assert!(super::write_lines(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
            vec![super::LineEdit {
                line: 1,
                text: "pwned".into()
            }],
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "safe\n");
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
        .unwrap()
        .changed;
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

        let all = search_fallback(root, root, "hello", &[], &[], false);
        assert_eq!(all.len(), 2);
        let only_src = search_fallback(root, scoped.to_str().unwrap(), "hello", &[], &[], false);
        assert_eq!(only_src.len(), 1);
    }

    #[test]
    fn fallback_finds_smart_case_matches() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "Hello world\nhello again\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "nothing here\n").unwrap();
        let root = dir.path().to_str().unwrap();

        // Case-insensitive: matches both "Hello" and "hello".
        let lower = search_fallback(root, root, "hello", &[], &[], false);
        assert_eq!(lower.len(), 2);

        // Case-sensitive: only "Hello world".
        let upper = search_fallback(root, root, "Hello", &[], &[], true);
        assert_eq!(upper.len(), 1);
        assert_eq!(upper[0].line, 1);
    }
}
