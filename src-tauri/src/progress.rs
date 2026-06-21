//! Reading progress: which files the user has read, per project.
//!
//! Stored as a JSON array of project-relative paths in `.reado/read.json`
//! (gitignored like the rest of `.reado/`), so it's personal and survives
//! restarts. Source of truth is the file; the frontend mirrors it in memory.

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

fn store_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("read.json")
}

fn load(root: &str) -> Vec<String> {
    std::fs::read_to_string(store_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// The project-relative paths marked read.
#[tauri::command]
pub fn list_read(root: String) -> Result<Vec<String>> {
    Ok(load(&root))
}

/// Mark a project-relative `path` read or unread; persists to `.reado/read.json`.
#[tauri::command]
pub fn set_read(root: String, path: String, read: bool) -> Result<()> {
    let mut paths = load(&root);
    paths.retain(|p| p != &path);
    if read {
        paths.push(path);
    }
    std::fs::create_dir_all(Path::new(&root).join(".reado"))?;
    let json = serde_json::to_string(&paths).map_err(|e| Error::Other(e.to_string()))?;
    std::fs::write(store_path(&root), json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        assert!(list_read(root.clone()).unwrap().is_empty());
        set_read(root.clone(), "src/a.ts".into(), true).unwrap();
        set_read(root.clone(), "src/b.ts".into(), true).unwrap();
        set_read(root.clone(), "src/a.ts".into(), false).unwrap();
        assert_eq!(list_read(root).unwrap(), vec!["src/b.ts".to_string()]);
    }
}
