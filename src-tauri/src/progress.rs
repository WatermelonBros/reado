//! Reading progress: which files the user has read, per project.
//!
//! Stored as a JSON array of project-relative paths in `.reado/read.json`
//! (gitignored like the rest of `.reado/`), so it's personal and survives
//! restarts. Source of truth is the file; the frontend mirrors it in memory.

use std::collections::HashMap;
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

/// Last-read content snapshots, so the reader can review only what changed since
/// they last read a file (the `read-delta` feature). Kept in one JSON map
/// (project-relative path → content); oversized/binary content is skipped.
const MAX_SNAPSHOT_BYTES: usize = 512 * 1024;

fn snapshot_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("read-snapshots.json")
}

fn load_snapshots(root: &str) -> HashMap<String, String> {
    std::fs::read_to_string(snapshot_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_snapshots(root: &str, map: &HashMap<String, String>) -> Result<()> {
    std::fs::create_dir_all(Path::new(root).join(".reado"))?;
    let json = serde_json::to_string(map).map_err(|e| Error::Other(e.to_string()))?;
    std::fs::write(snapshot_path(root), json)?;
    Ok(())
}

/// The content snapshotted when `path` was last marked read, if any.
#[tauri::command]
pub fn get_read_snapshot(root: String, path: String) -> Result<Option<String>> {
    Ok(load_snapshots(&root).remove(&path))
}

/// The project-relative paths marked read.
#[tauri::command]
pub fn list_read(root: String) -> Result<Vec<String>> {
    Ok(load(&root))
}

/// Mark a project-relative `path` read or unread; persists to `.reado/read.json`.
/// When marking read, `content` (if provided and not oversized) is snapshotted so
/// a later external change can be reviewed as a delta; marking unread drops it.
#[tauri::command]
pub fn set_read(root: String, path: String, read: bool, content: Option<String>) -> Result<()> {
    let mut paths = load(&root);
    paths.retain(|p| p != &path);
    if read {
        paths.push(path.clone());
    }
    std::fs::create_dir_all(Path::new(&root).join(".reado"))?;
    let json = serde_json::to_string(&paths).map_err(|e| Error::Other(e.to_string()))?;
    std::fs::write(store_path(&root), json)?;

    // Snapshot the last-read content. Kept on unread (an external change flips a
    // file to unread, and we still want its last-read baseline for the delta);
    // it's simply overwritten on the next read.
    if read {
        if let Some(c) = content {
            let mut snaps = load_snapshots(&root);
            if c.len() <= MAX_SNAPSHOT_BYTES {
                snaps.insert(path, c);
            } else {
                snaps.remove(&path); // oversized → no stale baseline
            }
            save_snapshots(&root, &snaps)?;
        }
    }
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
        set_read(root.clone(), "src/a.ts".into(), true, None).unwrap();
        set_read(root.clone(), "src/b.ts".into(), true, None).unwrap();
        set_read(root.clone(), "src/a.ts".into(), false, None).unwrap();
        assert_eq!(list_read(root).unwrap(), vec!["src/b.ts".to_string()]);
    }

    #[test]
    fn snapshots_on_read_and_drops_on_unread() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        set_read(root.clone(), "a.ts".into(), true, Some("v1".into())).unwrap();
        assert_eq!(get_read_snapshot(root.clone(), "a.ts".into()).unwrap(), Some("v1".into()));
        // Oversized content is skipped (no snapshot stored).
        let big = "x".repeat(MAX_SNAPSHOT_BYTES + 1);
        set_read(root.clone(), "b.ts".into(), true, Some(big)).unwrap();
        assert_eq!(get_read_snapshot(root.clone(), "b.ts".into()).unwrap(), None);
        // Unmark KEEPS the snapshot (the delta baseline survives an external change).
        set_read(root.clone(), "a.ts".into(), false, None).unwrap();
        assert_eq!(get_read_snapshot(root.clone(), "a.ts".into()).unwrap(), Some("v1".into()));
        // A new read overwrites it.
        set_read(root.clone(), "a.ts".into(), true, Some("v2".into())).unwrap();
        assert_eq!(get_read_snapshot(root, "a.ts".into()).unwrap(), Some("v2".into()));
    }
}
