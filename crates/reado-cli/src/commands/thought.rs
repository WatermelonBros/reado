//! `reado thought` — the agent's live narration channel.

use reado_core as core;

/// Append one reasoning line to `.reado/reasoning.jsonl` (creating `.reado/` if
/// needed). The agent's live narration channel: Reado's watcher sees the write,
/// emits `reasoning-changed`, and the reasoning panel re-reads the file.
pub(crate) fn run(
    root: &str,
    agent: &str,
    text: &str,
    kind: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Write;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let line = serde_json::json!({ "ts": ts, "kind": kind, "text": text, "agent": agent });
    let dir = core::reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(core::REASONING_FILE))?;
    // Build the whole record (including the trailing newline) and write it in a
    // single O_APPEND write, so concurrent `reado thought` processes can't
    // interleave a record and its newline into a corrupt, unparseable JSONL line.
    let mut record = serde_json::to_string(&line)?;
    record.push('\n');
    f.write_all(record.as_bytes())?;
    Ok(())
}
