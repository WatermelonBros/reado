//! Reading bookmarks: lightweight "return here" pins, per project.
//!
//! Stored as a JSON array in `.reado/bookmarks.json` (gitignored like the rest of
//! `.reado/`), so they're personal and survive restarts. Distinct from comments:
//! bookmarks carry no annotation and are never sent to an AI agent. Source of
//! truth is the file; the frontend mirrors it in memory and writes the whole set.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    /// Project-relative, forward-slashed path.
    pub path: String,
    /// 1-based line.
    pub line: u32,
    /// 1-based end line for a region (omitted for a single line).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub end_line: Option<u32>,
    /// A one-line snippet captured at creation, for the list display.
    pub snippet: String,
}

fn store_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("bookmarks.json")
}

/// This project's bookmarks.
#[tauri::command]
pub fn get_bookmarks(root: String) -> Result<Vec<Bookmark>> {
    Ok(std::fs::read_to_string(store_path(&root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default())
}

/// Replace the whole bookmark set; persists to `.reado/bookmarks.json`.
#[tauri::command]
pub fn set_bookmarks(root: String, bookmarks: Vec<Bookmark>) -> Result<()> {
    std::fs::create_dir_all(Path::new(&root).join(".reado"))?;
    let json = serde_json::to_string(&bookmarks).map_err(|e| Error::Other(e.to_string()))?;
    std::fs::write(store_path(&root), json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        assert!(get_bookmarks(root.clone()).unwrap().is_empty());
        set_bookmarks(
            root.clone(),
            vec![Bookmark {
                path: "src/a.ts".into(),
                line: 12,
                end_line: None,
                snippet: "const x = 1".into(),
            }],
        )
        .unwrap();
        let got = get_bookmarks(root).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].line, 12);
    }
}
