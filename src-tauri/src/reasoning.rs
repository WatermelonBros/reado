//! The agent's live **reasoning** feed — a throwaway, append-only narration
//! channel, deliberately separate from the durable review artifacts in
//! `.reado/sessions/`. The `reado thought` CLI appends one JSON line per thought
//! to `.reado/reasoning.jsonl`; the watcher emits `reasoning-changed`, and this
//! reads the file back for the reasoning panel.
//!
//! ponytail: experiment. One flat jsonl, no schema versioning, no reado-core
//! model — if the idea sticks it graduates into a proper store; if not, delete
//! this file, the CLI verb, and the panel.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;

/// One line of agent reasoning. `kind` is a free tag for styling (note /
/// decision / assumption / plan); the panel also treats an `Assumo:` prefix as
/// an assumption regardless.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thought {
    pub ts: i64,
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub agent: String,
}

fn reasoning_path(root: &str) -> PathBuf {
    Path::new(root).join(".reado").join("reasoning.jsonl")
}

/// Every reasoning line, oldest first. Missing file → empty; a malformed line is
/// skipped rather than failing the whole read (the agent appends concurrently).
#[tauri::command]
pub fn reasoning_read(root: String) -> Vec<Thought> {
    let Ok(raw) = std::fs::read_to_string(reasoning_path(&root)) else {
        return Vec::new();
    };
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<Thought>(l).ok())
        .collect()
}

/// Wipe the feed — used to start a fresh run during evaluation.
#[tauri::command]
pub fn reasoning_clear(root: String) -> Result<()> {
    let p = reasoning_path(&root);
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}
