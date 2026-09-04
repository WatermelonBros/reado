//! The local semantic index.
//!
//! "Where do we…?" used to go to the terminal agent, which searched the repo and
//! wrote ranked results back. That answers well but costs a round trip through
//! an LLM for a question a full-text index can usually answer in milliseconds —
//! and it can't answer at all when no agent is running.
//!
//! This is that index: a rebuildable SQLite table over the project's symbols,
//! paths and prose, queried with FTS5's BM25 ranking and a boost for a hit on a
//! declared symbol (a function named `parseConfig` is a better answer to "where
//! do we parse config" than a comment mentioning it). Like the comment index it
//! is **never authoritative**: it is rebuilt from the tree whenever it is
//! missing or stale, so deleting it loses nothing.
//!
//! The agent path is not gone — it is the escalation, behind an explicit "ask
//! the agent", for the questions a keyword index genuinely cannot answer.

use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::error::{Error, Result};
use crate::symbols::SymbolCache;

/// Biggest file we read into the index. Past this it is generated or vendored,
/// and indexing it costs more than the answers it would give.
const MAX_INDEXED_BYTES: u64 = 512 * 1024;
/// Cap on indexed files, so a monorepo doesn't turn project-open into a job.
const MAX_FILES: usize = 20_000;
/// Results returned for a query.
const MAX_HITS: usize = 40;

fn index_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("semantic.sqlite")
}

/// One ranked answer: where it is, and enough of the line to recognise it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    /// Project-relative, forward-slashed.
    pub file: String,
    /// 1-based.
    pub line: u32,
    pub snippet: String,
    /// The declared symbol this hit is on, when it is one. Drives the boost and
    /// lets the UI show *why* a result ranked where it did.
    pub symbol: Option<String>,
}

/// Whether this SQLite build has FTS5. Bundled rusqlite does, but the fallback
/// keeps the feature working rather than failing on an unusual build.
fn has_fts5(conn: &Connection) -> bool {
    conn.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts5_probe USING fts5(x);")
        .is_ok()
}

/// Text worth indexing: source, config and prose. Binary and generated trees are
/// excluded by the walker's gitignore handling; this is the extension gate.
fn indexable(path: &Path) -> bool {
    const SKIP: [&str; 12] = [
        "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip", "gz", "woff", "woff2", "ttf",
    ];
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => !SKIP.contains(&ext.to_ascii_lowercase().as_str()),
        // No extension: Makefile, Dockerfile, LICENSE — all worth having.
        None => true,
    }
}

fn schema(conn: &Connection, fts: bool) -> Result<()> {
    let sql = if fts {
        // `content=''` keeps this contentless: we store what we need in the FTS
        // columns themselves rather than duplicating the file bodies on disk.
        "DROP TABLE IF EXISTS docs;
         CREATE VIRTUAL TABLE docs USING fts5(
             file UNINDEXED, line UNINDEXED, snippet UNINDEXED, symbol, body,
             tokenize = 'unicode61 remove_diacritics 2'
         );"
    } else {
        "DROP TABLE IF EXISTS docs;
         CREATE TABLE docs (
             file TEXT, line INTEGER, snippet TEXT, symbol TEXT, body TEXT
         );
         CREATE INDEX idx_docs_body ON docs(body);"
    };
    conn.execute_batch(sql)
        .map_err(|e| Error::Other(e.to_string()))
}

/// A line worth indexing: not blank, not a lone bracket. Indexing punctuation
/// only dilutes the ranking.
fn worth_indexing(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() > 2 && trimmed.chars().any(|c| c.is_alphanumeric())
}

/// Build the index from the tree. Drops and recreates, so a rebuild is always a
/// faithful mirror rather than an accumulation.
fn rebuild(cache: &SymbolCache, root: &str) -> Result<usize> {
    let reado = Path::new(root).join(".reado");
    std::fs::create_dir_all(&reado)?;
    let mut conn = Connection::open(index_path(root)).map_err(|e| Error::Other(e.to_string()))?;
    // Off the main thread this can race an incremental reindex; wait it out.
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| Error::Other(e.to_string()))?;
    let fts = has_fts5(&conn);
    schema(&conn, fts)?;

    // Symbols first: a map from (file, line) to the declared name there, so a
    // hit on a declaration can be told from a hit on a mention.
    let symbols = crate::symbols::symbols_by_line(cache, root);

    let tx = conn
        .transaction()
        .map_err(|e| Error::Other(e.to_string()))?;
    let mut count = 0usize;
    let mut files = 0usize;
    {
        let mut insert = tx
            .prepare("INSERT INTO docs (file, line, snippet, symbol, body) VALUES (?1,?2,?3,?4,?5)")
            .map_err(|e| Error::Other(e.to_string()))?;

        for entry in WalkBuilder::new(root).build().flatten() {
            if files >= MAX_FILES {
                break;
            }
            if !entry.file_type().is_some_and(|ft| ft.is_file()) {
                continue;
            }
            let path = entry.path();
            if !indexable(path) {
                continue;
            }
            if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) > MAX_INDEXED_BYTES {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(path) else {
                continue; // not UTF-8 — nothing to search in it
            };
            let rel = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            files += 1;

            for (i, line) in text.lines().enumerate() {
                if !worth_indexing(line) {
                    continue;
                }
                let no = i as u32 + 1;
                let symbol = symbols.get(&(rel.clone(), no)).cloned();
                let snippet: String = line.trim().chars().take(200).collect();
                // The path is part of the body: "where do we handle auth" should
                // match `src/auth/session.ts` even when the line doesn't say it.
                let body = format!("{rel} {snippet}");
                insert
                    .execute(rusqlite::params![
                        rel,
                        no,
                        snippet,
                        symbol.clone().unwrap_or_default(),
                        body
                    ])
                    .map_err(|e| Error::Other(e.to_string()))?;
                count += 1;
            }
        }
    }
    tx.commit().map_err(|e| Error::Other(e.to_string()))?;
    Ok(count)
}

/// Turn a natural-language question into an FTS5 query.
///
/// The words a question is *made of* ("where", "do", "we") are noise; what
/// matters is the nouns and verbs around them. Each remaining term is matched as
/// a prefix so "config" finds "configure", and they are OR-ed so a question that
/// half-matches still answers rather than returning nothing.
fn fts_query(q: &str) -> String {
    const STOPWORDS: [&str; 24] = [
        "where", "do", "we", "the", "a", "an", "is", "are", "how", "what", "does", "did", "in",
        "of", "to", "for", "and", "or", "our", "this", "that", "it", "on", "with",
    ];
    let terms: Vec<String> = q
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| t.len() > 1)
        .map(|t| t.to_ascii_lowercase())
        .filter(|t| !STOPWORDS.contains(&t.as_str()))
        .take(12)
        .map(|t| format!("\"{t}\"*"))
        .collect();
    terms.join(" OR ")
}

/// The same terms, for the no-FTS5 fallback's LIKE matching.
fn plain_terms(q: &str) -> Vec<String> {
    fts_query(q)
        .split(" OR ")
        .filter_map(|t| t.trim_matches(['"', '*']).to_string().into())
        .filter(|t: &String| !t.is_empty())
        .collect()
}

/// Query the index. Ranked by BM25, with a hit on a declared symbol pulled
/// ahead: a function *named* for what you asked about is a better answer than a
/// line that mentions it.
fn query(root: &str, q: &str) -> Result<Vec<Hit>> {
    let path = index_path(root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let conn = Connection::open(path).map_err(|e| Error::Other(e.to_string()))?;
    let terms = fts_query(q);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let fts = conn
        .prepare("SELECT 1 FROM docs LIMIT 0")
        .ok()
        .and_then(|_| {
            conn.prepare("SELECT bm25(docs) FROM docs LIMIT 0")
                .ok()
                .map(|_| true)
        })
        .unwrap_or(false);

    let mut hits = Vec::new();
    if fts {
        let mut stmt = conn
            .prepare(
                "SELECT file, line, snippet, symbol,
                        bm25(docs) - (CASE WHEN symbol != '' THEN 2.0 ELSE 0.0 END) AS rank
                 FROM docs WHERE docs MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(|e| Error::Other(e.to_string()))?;
        let rows = stmt
            .query_map(rusqlite::params![terms, MAX_HITS as i64], |r| {
                Ok(Hit {
                    file: r.get(0)?,
                    line: r.get::<_, i64>(1)? as u32,
                    snippet: r.get(2)?,
                    symbol: r.get::<_, String>(3).ok().filter(|s| !s.is_empty()),
                })
            })
            .map_err(|e| Error::Other(e.to_string()))?;
        for hit in rows.flatten() {
            hits.push(hit);
        }
    } else {
        // Fallback: no BM25, so rank by how many terms a line carries, symbols
        // first. Cruder, but the feature still works.
        let words = plain_terms(q);
        let mut stmt = conn
            .prepare("SELECT file, line, snippet, symbol, body FROM docs")
            .map_err(|e| Error::Other(e.to_string()))?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)? as u32,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?.to_ascii_lowercase(),
                ))
            })
            .map_err(|e| Error::Other(e.to_string()))?;
        let mut scored: Vec<(i32, Hit)> = Vec::new();
        for (file, line, snippet, symbol, body) in rows.flatten() {
            let matched = words.iter().filter(|w| body.contains(*w)).count() as i32;
            if matched == 0 {
                continue;
            }
            let boost = if symbol.is_empty() { 0 } else { 2 };
            scored.push((
                matched + boost,
                Hit {
                    file,
                    line,
                    snippet,
                    symbol: (!symbol.is_empty()).then_some(symbol),
                },
            ));
        }
        scored.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
        hits = scored.into_iter().take(MAX_HITS).map(|(_, h)| h).collect();
    }
    Ok(hits)
}

/// (Re)build the semantic index. Called on project open and after a change the
/// incremental path can't absorb. `async` so a full walk of the project doesn't
/// block the UI thread while it runs.
#[tauri::command(async)]
pub fn semantic_rebuild(cache: State<'_, SymbolCache>, root: String) -> Result<usize> {
    let started = std::time::Instant::now();
    let result = rebuild(&cache, &root);
    match &result {
        Ok(count) => crate::log::info(
            "semantic",
            "index rebuilt",
            serde_json::json!({ "lines": count, "ms": started.elapsed().as_millis() as u64 }),
        ),
        Err(e) => crate::log::error(
            "semantic",
            "index rebuild failed",
            serde_json::json!({ "error": e.to_string() }),
        ),
    }
    result
}

/// Re-index one file in place, for the watcher's `file-changed`. Cheaper than a
/// rebuild by the size of the project; falls back to nothing when the index is
/// absent (the next open rebuilds it).
///
/// `async` (so Tauri runs it off the main thread) and single-transaction on
/// purpose: an agent editing a dozen files fires a dozen of these, and this used
/// to be an fsync per indexed *line* on the UI thread — seconds of a frozen
/// window (macOS spinner) per file the agent touched.
#[tauri::command(async)]
pub fn semantic_reindex_file(
    cache: State<'_, SymbolCache>,
    root: String,
    file: String,
) -> Result<usize> {
    let path = index_path(&root);
    if !path.exists() {
        return Ok(0);
    }
    let mut conn = Connection::open(&path).map_err(|e| Error::Other(e.to_string()))?;
    // Now that this runs on a worker thread it can meet a concurrent rebuild;
    // wait for it rather than failing the reindex outright.
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| Error::Other(e.to_string()))?;

    let abs = Path::new(&root).join(&file);
    // A file the rebuild would skip (binary, generated, huge) must not sneak into
    // the index through the incremental path — but its old rows still go.
    let text = if indexable(&abs)
        && std::fs::metadata(&abs).map(|m| m.len()).unwrap_or(0) <= MAX_INDEXED_BYTES
    {
        std::fs::read_to_string(&abs).unwrap_or_default()
    } else {
        String::new()
    };
    let symbols = crate::symbols::symbols_in_file(&cache, &abs);

    let tx = conn
        .transaction()
        .map_err(|e| Error::Other(e.to_string()))?;
    tx.execute("DELETE FROM docs WHERE file = ?1", [&file])
        .map_err(|e| Error::Other(e.to_string()))?;
    let mut count = 0;
    {
        let mut insert = tx
            .prepare("INSERT INTO docs (file, line, snippet, symbol, body) VALUES (?1,?2,?3,?4,?5)")
            .map_err(|e| Error::Other(e.to_string()))?;
        for (i, line) in text.lines().enumerate() {
            if !worth_indexing(line) {
                continue;
            }
            let no = i as u32 + 1;
            let snippet: String = line.trim().chars().take(200).collect();
            insert
                .execute(rusqlite::params![
                    file,
                    no,
                    snippet,
                    symbols.get(&no).cloned().unwrap_or_default(),
                    format!("{file} {snippet}")
                ])
                .map_err(|e| Error::Other(e.to_string()))?;
            count += 1;
        }
    }
    tx.commit().map_err(|e| Error::Other(e.to_string()))?;
    Ok(count)
}

/// Answer a natural-language query from the local index. Empty when the index
/// hasn't been built yet — the caller can then offer the agent instead.
#[tauri::command]
pub fn semantic_query(root: String, q: String) -> Result<Vec<Hit>> {
    query(&root, &q)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> (tempfile::TempDir, SymbolCache) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(
            dir.path().join("src/config.ts"),
            "export function parseConfig(text) {\n  // read the settings file\n  return JSON.parse(text)\n}\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("src/other.ts"),
            "// we mention config here in passing\nconst unrelated = 1\n",
        )
        .unwrap();
        let cache = SymbolCache::default();
        rebuild(&cache, &dir.path().to_string_lossy()).unwrap();
        (dir, cache)
    }

    #[test]
    fn indexes_lines_and_answers_a_question() {
        let (dir, _cache) = seeded();
        let hits = query(&dir.path().to_string_lossy(), "where do we parse config").unwrap();
        assert!(!hits.is_empty(), "the index answered nothing");
        assert!(hits.iter().any(|h| h.file == "src/config.ts"));
    }

    #[test]
    fn a_declaration_outranks_a_passing_mention() {
        let (dir, _cache) = seeded();
        let hits = query(&dir.path().to_string_lossy(), "parse config").unwrap();
        // The function named for the question should beat the comment that
        // merely says the word.
        assert_eq!(hits[0].file, "src/config.ts");
    }

    #[test]
    fn the_path_itself_is_searchable() {
        let (dir, _cache) = seeded();
        // Nothing in other.ts's text says "src", but its path does.
        let hits = query(&dir.path().to_string_lossy(), "config.ts").unwrap();
        assert!(hits.iter().any(|h| h.file == "src/config.ts"));
    }

    #[test]
    fn an_unanswerable_question_returns_nothing_rather_than_noise() {
        let (dir, _cache) = seeded();
        let hits = query(&dir.path().to_string_lossy(), "quantum entanglement").unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn a_question_of_only_stopwords_asks_nothing() {
        assert_eq!(fts_query("where do we"), "");
        let (dir, _cache) = seeded();
        assert!(query(&dir.path().to_string_lossy(), "where do we")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn terms_are_prefix_matched_and_or_ed() {
        // "config" must find "configure"; a half-matching question still answers.
        assert_eq!(fts_query("parse config"), "\"parse\"* OR \"config\"*");
    }

    #[test]
    fn querying_before_the_index_exists_is_empty_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let hits = query(&dir.path().to_string_lossy(), "anything").unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn a_rebuild_reflects_deletions() {
        let (dir, cache) = seeded();
        let root = dir.path().to_string_lossy().to_string();
        std::fs::remove_file(dir.path().join("src/config.ts")).unwrap();
        rebuild(&cache, &root).unwrap();
        let hits = query(&root, "parseConfig").unwrap();
        assert!(
            hits.is_empty(),
            "a rebuild is a mirror, not an accumulation"
        );
    }

    #[test]
    fn reindexing_one_file_replaces_only_its_rows() {
        let (dir, _cache) = seeded();
        let root = dir.path().to_string_lossy().to_string();
        std::fs::write(dir.path().join("src/config.ts"), "const nothing = 1\n").unwrap();

        // Emulate the command's body (the Tauri State wrapper isn't constructible
        // in a unit test): delete the file's rows, re-insert from disk.
        let conn = Connection::open(index_path(&root)).unwrap();
        conn.execute("DELETE FROM docs WHERE file = ?1", ["src/config.ts"])
            .unwrap();
        conn.execute(
            "INSERT INTO docs (file, line, snippet, symbol, body) VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                "src/config.ts",
                1,
                "const nothing = 1",
                "",
                "src/config.ts const nothing = 1"
            ],
        )
        .unwrap();

        assert!(query(&root, "parseConfig").unwrap().is_empty());
        // The other file's rows survived the surgical delete.
        assert!(!query(&root, "unrelated").unwrap().is_empty());
    }

    #[test]
    fn binary_and_oversized_files_are_skipped() {
        assert!(!indexable(Path::new("logo.png")));
        assert!(!indexable(Path::new("font.woff2")));
        assert!(indexable(Path::new("Makefile")));
        assert!(indexable(Path::new("src/main.rs")));
    }

    #[test]
    fn punctuation_only_lines_are_not_indexed() {
        assert!(!worth_indexing("}"));
        assert!(!worth_indexing("   "));
        assert!(!worth_indexing("{"));
        assert!(worth_indexing("const x = 1"));
    }
}
