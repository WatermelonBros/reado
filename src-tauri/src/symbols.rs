//! Lightweight, LSP-free go-to-definition and workspace symbols.
//!
//! Without a language server, a symbol is resolved by scanning the project
//! (gitignore-aware) for lines that *declare* it — `keyword NAME`, `NAME = …`,
//! or `NAME(…)` — ranked by how definition-like each line is. Heuristic, but it
//! covers the common case across languages and needs no per-language setup.
//!
//! Each file's declaration records are extracted **once** and cached, keyed by
//! the file's mtime, so a repeated symbol query (open the picker, jump to a
//! definition) doesn't re-read and re-scan unchanged files. Only new/changed
//! files are re-extracted.
//!
//! ponytail: the index is in-memory (no cross-restart persistence) and bounded by
//! a clear-all eviction. A SQLite-backed index if warm-start latency ever matters.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use ignore::WalkBuilder;
use regex::Regex;
use serde::Serialize;
use tauri::State;

const KEYWORDS: &str =
    "function|func|fn|def|class|interface|type|enum|struct|trait|impl|module|namespace|const|let|var|val";

/// Total files kept in the index; cleared past this so a long session on a large
/// repo can't grow it without bound.
const SYMBOL_CACHE_MAX: usize = 4000;
/// Files larger than this are skipped (not indexed) — they're rarely navigable
/// source and are the memory risk.
const MAX_INDEXED_FILE_BYTES: u64 = 512 * 1024;

/// One declaration-like site on a line: the leading/declared identifier, how
/// definition-like it is, and (for keyword declarations) the declaring keyword.
#[derive(Clone)]
struct DefRecord {
    name: String,
    /// Declaring keyword for score-3 records; empty otherwise.
    kind: String,
    /// 3 = keyword declaration, 2 = assignment/field, 1 = call-like.
    score: u8,
    line: u64,
    /// The trimmed declaration line, for a peek/preview.
    text: String,
}

/// Per-file extracted records, keyed by the file's mtime for invalidation.
#[derive(Default)]
pub struct SymbolCache(Mutex<HashMap<PathBuf, (SystemTime, Vec<DefRecord>)>>);

struct Extractors {
    keyword: Regex,
    assign: Regex,
    callish: Regex,
}

/// The name-independent extraction regexes, compiled once for the whole process.
fn extractors() -> &'static Extractors {
    static EX: OnceLock<Extractors> = OnceLock::new();
    EX.get_or_init(|| {
        let modifiers = r"(?:export\s+|default\s+|public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|pub\s+)*";
        let ident = r"[A-Za-z_$][A-Za-z0-9_$]*";
        Extractors {
            keyword: Regex::new(&format!(r"(?:^|[^\w.])({KEYWORDS})\s+({ident})")).unwrap(),
            assign: Regex::new(&format!(r"^\s*{modifiers}({ident})\s*[:=]")).unwrap(),
            callish: Regex::new(&format!(r"^\s*{modifiers}({ident})\s*\(")).unwrap(),
        }
    })
}

fn trim200(line: &str) -> String {
    line.trim().chars().take(200).collect()
}

/// Extract the best declaration record per line: keyword > assignment > call.
/// One record per line (matching the previous per-line scoring), so the result
/// is behaviour-identical to the old name-specific scan once filtered by name.
fn extract_records(content: &str) -> Vec<DefRecord> {
    let ex = extractors();
    let mut recs = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let ln = (i + 1) as u64;
        if let Some(c) = ex.keyword.captures(line) {
            recs.push(DefRecord {
                name: c[2].to_string(),
                kind: c[1].to_string(),
                score: 3,
                line: ln,
                text: trim200(line),
            });
        } else if let Some(c) = ex.assign.captures(line) {
            recs.push(DefRecord {
                name: c[1].to_string(),
                kind: String::new(),
                score: 2,
                line: ln,
                text: trim200(line),
            });
        } else if let Some(c) = ex.callish.captures(line) {
            recs.push(DefRecord {
                name: c[1].to_string(),
                kind: String::new(),
                score: 1,
                line: ln,
                text: trim200(line),
            });
        }
    }
    recs
}

/// Records for `path`, served from the index when the file's mtime is unchanged,
/// otherwise re-extracted (and cached). Oversized files are skipped (no records).
fn records_for(cache: &SymbolCache, path: &Path) -> Vec<DefRecord> {
    let meta = std::fs::metadata(path).ok();
    let mtime = meta.as_ref().and_then(|m| m.modified().ok());

    if let Some(mt) = mtime {
        if let Ok(map) = cache.0.lock() {
            if let Some((cached_mt, recs)) = map.get(path) {
                if *cached_mt == mt {
                    return recs.clone();
                }
            }
        }
    }

    let too_big = meta
        .as_ref()
        .is_some_and(|m| m.len() > MAX_INDEXED_FILE_BYTES);
    let recs = if too_big {
        Vec::new()
    } else {
        match std::fs::read_to_string(path) {
            Ok(content) => extract_records(&content),
            Err(_) => Vec::new(), // unreadable or binary
        }
    };

    // Cache only when we can invalidate by mtime and didn't skip for size.
    if let (Some(mt), false) = (mtime, too_big) {
        if let Ok(mut map) = cache.0.lock() {
            if map.len() >= SYMBOL_CACHE_MAX {
                map.clear(); // clear-all eviction; entries re-extract lazily
            }
            map.insert(path.to_path_buf(), (mt, recs.clone()));
        }
    }
    recs
}

/// One candidate definition site for a symbol.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    /// Absolute path, so the frontend can open it directly.
    pub path: String,
    /// 1-based line number.
    pub line: u64,
    /// The trimmed declaration line, for a peek/preview.
    pub text: String,
    /// Confidence: 3 = keyword declaration, 2 = assignment/field, 1 = call-like.
    pub score: u8,
}

fn valid_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '$')
}

/// Find where `name` is defined across the project, best matches first.
#[tauri::command]
pub fn find_definition(cache: State<SymbolCache>, root: String, name: String) -> Vec<Definition> {
    find_definition_in(&cache, &root, &name)
}

fn find_definition_in(cache: &SymbolCache, root: &str, name: &str) -> Vec<Definition> {
    if !valid_identifier(name) {
        return Vec::new();
    }
    let mut defs = Vec::new();
    for entry in WalkBuilder::new(root).build().flatten() {
        if defs.len() >= 200 {
            break;
        }
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        for r in records_for(cache, path) {
            if r.name == name {
                defs.push(Definition {
                    path: path.to_string_lossy().into_owned(),
                    line: r.line,
                    text: r.text,
                    score: r.score,
                });
                if defs.len() >= 200 {
                    break;
                }
            }
        }
    }
    // Strongest declarations first; stable within a score.
    defs.sort_by_key(|d| std::cmp::Reverse(d.score));
    defs
}

/// One declared symbol, for the workspace symbol picker (Cmd+T).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Symbol {
    pub name: String,
    /// The declaring keyword (function/class/…), shown as a kind hint.
    pub kind: String,
    pub path: String,
    pub line: u64,
}

/// List declared symbols across the project (gitignore-aware), for fuzzy
/// jump-to-definition by name. Heuristic and capped, backed by the symbol index.
#[tauri::command]
pub fn list_symbols(cache: State<SymbolCache>, root: String) -> Vec<Symbol> {
    list_symbols_in(&cache, &root)
}

fn list_symbols_in(cache: &SymbolCache, root: &str) -> Vec<Symbol> {
    let mut out = Vec::new();
    for entry in WalkBuilder::new(root).build().flatten() {
        if out.len() >= 5000 {
            break;
        }
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        for r in records_for(cache, path) {
            if r.score == 3 {
                out.push(Symbol {
                    name: r.name,
                    kind: r.kind,
                    path: path.to_string_lossy().into_owned(),
                    line: r.line,
                });
                if out.len() >= 5000 {
                    break;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_declared_symbols() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("a.ts"),
            "export function add(a, b) {}\nclass Foo {}\nconst x = 1;\n",
        )
        .unwrap();
        let syms = list_symbols_in(&SymbolCache::default(), dir.path().to_str().unwrap());
        let names: Vec<_> = syms.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"add") && names.contains(&"Foo") && names.contains(&"x"));
    }

    #[test]
    fn ranks_declarations_above_calls() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("a.ts"),
            "import { add } from './m';\nexport function add(a, b) {\n  return a + b;\n}\nadd(1, 2);\n",
        )
        .unwrap();
        let defs = find_definition_in(&SymbolCache::default(), dir.path().to_str().unwrap(), "add");
        assert!(!defs.is_empty());
        // The `function add` line wins over the call and import.
        assert_eq!(defs[0].score, 3);
        assert_eq!(defs[0].line, 2);
    }

    #[test]
    fn rejects_non_identifiers() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let cache = SymbolCache::default();
        assert!(find_definition_in(&cache, root, "a b").is_empty());
        assert!(find_definition_in(&cache, root, "").is_empty());
    }

    #[test]
    fn cached_second_call_is_consistent_and_sees_new_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.ts"), "function one() {}\n").unwrap();
        let cache = SymbolCache::default();
        let root = dir.path().to_str().unwrap();

        let first = list_symbols_in(&cache, root);
        assert_eq!(first.iter().filter(|s| s.name == "one").count(), 1);
        // Second call (a.ts unchanged → served from the index) is identical.
        let second = list_symbols_in(&cache, root);
        assert_eq!(second.len(), first.len());

        // A new file must still be picked up (cache miss → extracted).
        std::fs::write(dir.path().join("b.ts"), "class Two {}\n").unwrap();
        let third = list_symbols_in(&cache, root);
        assert!(third.iter().any(|s| s.name == "Two"));
    }

    #[test]
    fn edited_file_is_reindexed_on_mtime_change() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.ts");
        std::fs::write(&file, "function before() {}\n").unwrap();
        let cache = SymbolCache::default();
        let root = dir.path().to_str().unwrap();

        assert!(list_symbols_in(&cache, root)
            .iter()
            .any(|s| s.name == "before"));

        // Advance mtime past the filesystem's resolution, then rewrite. Modern
        // dev/CI filesystems are sub-second; 20ms is ample. (ceiling: coarse-mtime
        // filesystems would need a longer wait.)
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&file, "function after() {}\n").unwrap();

        let syms = list_symbols_in(&cache, root);
        assert!(syms.iter().any(|s| s.name == "after"));
        assert!(!syms.iter().any(|s| s.name == "before"));
    }
}
