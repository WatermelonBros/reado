//! Lightweight, LSP-free go-to-definition.
//!
//! Without a language server, a symbol is resolved by scanning the project
//! (gitignore-aware) for lines that *declare* it — `keyword NAME`, `NAME = …`,
//! or `NAME(…)` — ranked by how definition-like each line is. Heuristic, but it
//! covers the common case across languages and needs no per-language setup.
//!
//! ponytail: scans files on each call (no persistent index). Fine for typical
//! projects; build an incremental symbol index if it ever feels slow.

use ignore::WalkBuilder;
use regex::Regex;
use serde::Serialize;

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

const KEYWORDS: &str =
    "function|func|fn|def|class|interface|type|enum|struct|trait|impl|module|namespace|const|let|var|val";

/// Find where `name` is defined across the project, best matches first.
#[tauri::command]
pub fn find_definition(root: String, name: String) -> Vec<Definition> {
    // Only resolve plausible identifiers.
    if name.is_empty()
        || name.len() > 100
        || !name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$')
    {
        return Vec::new();
    }
    let n = regex::escape(&name);
    let modifiers = r"(?:export\s+|default\s+|public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|pub\s+)*";

    let keyword = Regex::new(&format!(r"(?:^|[^\w.])(?:{KEYWORDS})\s+{n}\b"));
    let assign = Regex::new(&format!(r"^\s*{modifiers}{n}\s*[:=]"));
    let callish = Regex::new(&format!(r"^\s*{modifiers}{n}\s*\("));
    let (keyword, assign, callish) = match (keyword, assign, callish) {
        (Ok(k), Ok(a), Ok(c)) => (k, a, c),
        _ => return Vec::new(),
    };

    let mut defs = Vec::new();
    for entry in WalkBuilder::new(&root).build().flatten() {
        if defs.len() >= 200 {
            break;
        }
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue; // unreadable or binary
        };
        for (i, line) in content.lines().enumerate() {
            if !line.contains(&name) {
                continue; // cheap reject before the regexes
            }
            let score = if keyword.is_match(line) {
                3
            } else if assign.is_match(line) {
                2
            } else if callish.is_match(line) {
                1
            } else {
                continue;
            };
            defs.push(Definition {
                path: entry.path().to_string_lossy().into_owned(),
                line: (i + 1) as u64,
                text: line.trim().chars().take(200).collect(),
                score,
            });
        }
    }
    // Strongest declarations first; stable within a score.
    defs.sort_by(|a, b| b.score.cmp(&a.score));
    defs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_declarations_above_calls() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("a.ts"),
            "import { add } from './m';\nexport function add(a, b) {\n  return a + b;\n}\nadd(1, 2);\n",
        )
        .unwrap();
        let defs = find_definition(dir.path().to_str().unwrap().into(), "add".into());
        assert!(!defs.is_empty());
        // The `function add` line wins over the call and import.
        assert_eq!(defs[0].score, 3);
        assert_eq!(defs[0].line, 2);
    }

    #[test]
    fn rejects_non_identifiers() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(find_definition(root.into(), "a b".into()).is_empty());
        assert!(find_definition(root.into(), String::new()).is_empty());
    }
}
