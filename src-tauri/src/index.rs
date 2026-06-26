//! The SQLite comment index.
//!
//! A rebuildable cache (`.reado/index.sqlite`, gitignored) over the comment
//! `.md` files, for fast queries and the knowledge graph at scale. It is **never
//! authoritative** — it is reconstructed in full from the `.md` files whenever it
//! is missing or stale, so deleting it loses nothing.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::error::{Error, Result};

fn index_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("index.sqlite")
}

/// (Re)build the index from the `.md` files. Drops and recreates the table so a
/// rebuild is always a faithful mirror of the on-disk source of truth.
fn rebuild(root: &str) -> Result<usize> {
    let reado = Path::new(root).join(".reado");
    if !reado.exists() {
        return Ok(0);
    }
    std::fs::create_dir_all(&reado)?;
    let conn = Connection::open(index_path(root)).map_err(|e| Error::Other(e.to_string()))?;
    conn.execute_batch(
        "DROP TABLE IF EXISTS comments;
         CREATE TABLE comments (
             id TEXT PRIMARY KEY,
             type TEXT, state TEXT, kind TEXT,
             file TEXT, start_line INTEGER, end_line INTEGER,
             orphan INTEGER, archived INTEGER,
             body TEXT, created_at INTEGER, updated_at INTEGER
         );
         CREATE INDEX idx_comments_file ON comments(file);
         CREATE INDEX idx_comments_state ON comments(state);",
    )
    .map_err(|e| Error::Other(e.to_string()))?;

    let active = reado_core::list_comments(root);
    let archived = reado_core::list_archived(root);
    let mut count = 0;
    for c in active.iter().chain(archived.iter()) {
        conn.execute(
            "INSERT OR REPLACE INTO comments
             (id, type, state, kind, file, start_line, end_line, orphan, archived, body, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![
                c.meta.id,
                format!("{:?}", c.meta.comment_type).to_lowercase(),
                format!("{:?}", c.meta.state).to_lowercase(),
                format!("{:?}", c.meta.kind).to_lowercase(),
                c.meta.anchor.file,
                c.meta.anchor.start_line,
                c.meta.anchor.end_line,
                c.meta.orphan as i64,
                c.archived as i64,
                c.messages.first().map(|m| m.body.as_str()).unwrap_or(""),
                c.meta.created_at as i64,
                c.meta.updated_at as i64,
            ],
        )
        .map_err(|e| Error::Other(e.to_string()))?;
        count += 1;
    }
    Ok(count)
}

/// Build the index on project open if missing, then keep it fresh; returns the
/// number of indexed comments. Always rebuilds from the `.md` files, so it is
/// correct even after the index was deleted or comments changed externally.
#[tauri::command]
pub fn rebuild_index(root: String) -> Result<usize> {
    let started = std::time::Instant::now();
    let result = rebuild(&root);
    match &result {
        Ok(count) => crate::log::info(
            "index",
            "rebuilt",
            serde_json::json!({ "comments": count, "ms": started.elapsed().as_millis() as u64 }),
        ),
        Err(e) => crate::log::error(
            "index",
            "rebuild failed",
            serde_json::json!({ "error": e.to_string() }),
        ),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use reado_core::{create_comment, CommentKind, CommentType, Context, NewComment, Scope};

    #[test]
    fn rebuilds_from_markdown_without_loss() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        for i in 0..3 {
            create_comment(
                root,
                NewComment {
                    file: format!("src/f{i}.rs"),
                    scope: Scope::Range,
                    start_line: 1,
                    end_line: 1,
                    comment_type: CommentType::Bug,
                    kind: CommentKind::Task,
                    body: format!("issue {i}"),
                    context: Context::default(),
                },
                "user",
                None,
            )
            .unwrap();
        }

        // First build.
        assert_eq!(rebuild(root).unwrap(), 3);

        // Delete the index and rebuild — still complete (spec scenario).
        std::fs::remove_file(index_path(root)).unwrap();
        assert_eq!(rebuild(root).unwrap(), 3);

        let conn = Connection::open(index_path(root)).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM comments", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 3);
    }
}
