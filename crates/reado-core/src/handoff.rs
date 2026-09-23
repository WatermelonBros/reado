//! Turn handoff: the small whole-file signals the agent leaves for the desktop.

use serde::{Deserialize, Serialize};

use crate::store::{atomic_write, now_millis, reado_dir, ReadoLock, DONE_FILE, MASCOT_FILE};
use crate::{Error, Result};

/// What the agent said as it handed control back.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct SessionDone {
    /// `done`, `blocked` or `failed`.
    pub status: String,
    /// One line on what happened; may be empty.
    pub summary: String,
    pub at: u64,
}

/// What the agent asked the mascot to say.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MascotSay {
    pub text: String,
    /// One of the companion's states; empty means "just say it".
    pub mood: String,
    pub at: u64,
}

/// The most words the companion will carry. A bubble is a line or two read from
/// across the room, not a report: longer than this is refused rather than
/// truncated, so the agent knows its message did not arrive whole.
pub const MASCOT_MAX: usize = 280;

/// Record something for the companion to say.
///
/// Whole-file like the handoff below, and for the same reason: only the most
/// recent one matters, and the timestamp is what makes two identical sayings
/// distinguishable so the second one still shows.
pub fn mark_mascot_say(root: &str, text: &str, mood: &str) -> Result<MascotSay> {
    let text = text.trim();
    if text.is_empty() {
        return Err(Error::Rejected("nothing to say: `text` is empty".into()));
    }
    if text.chars().count() > MASCOT_MAX {
        return Err(Error::Rejected(format!(
            "too long for a speech bubble: {} characters, the limit is {MASCOT_MAX}",
            text.chars().count()
        )));
    }
    let _lock = ReadoLock::acquire(root)?;
    let say = MascotSay {
        text: text.to_string(),
        mood: mood.trim().to_string(),
        at: now_millis(),
    };
    let dir = reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    let json = serde_json::to_vec_pretty(&say).map_err(|e| Error::Json(e.to_string()))?;
    atomic_write(&dir.join(MASCOT_FILE), &json)?;
    Ok(say)
}

/// Record that the agent finished a turn.
///
/// Written as a whole file rather than appended: the desktop only ever cares
/// about the most recent handoff, and the watcher fires on the write. The
/// timestamp is what makes two consecutive identical handoffs distinguishable,
/// so a second "done" with the same summary still rings.
pub fn mark_session_done(root: &str, status: &str, summary: &str) -> Result<SessionDone> {
    let _lock = ReadoLock::acquire(root)?;
    let done = SessionDone {
        status: status.to_string(),
        summary: summary.trim().to_string(),
        at: now_millis(),
    };
    let dir = reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    let json = serde_json::to_vec_pretty(&done).map_err(|e| Error::Json(e.to_string()))?;
    atomic_write(&dir.join(DONE_FILE), &json)?;
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_handoff_is_written_where_the_watcher_looks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();

        let done = mark_session_done(&root, "done", "  rewrote the parser  ").unwrap();
        assert_eq!(done.status, "done");
        // Trimmed: the summary goes straight into a notification body.
        assert_eq!(done.summary, "rewrote the parser");
        assert!(done.at > 0);

        // The watcher keys on this exact path.
        let path = dir.path().join(".reado/done.json");
        assert!(path.exists(), "expected .reado/done.json");
        let back: SessionDone = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(back, done);
    }

    #[test]
    fn a_second_handoff_replaces_the_first_and_still_moves() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let first = mark_session_done(&root, "blocked", "needs a token").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let second = mark_session_done(&root, "done", "needs a token").unwrap();
        // Same summary twice must still read as a new handoff, or the second
        // turn would ring nothing.
        assert!(second.at > first.at);
        assert_eq!(second.status, "done");
        let back: SessionDone =
            serde_json::from_slice(&std::fs::read(dir.path().join(".reado/done.json")).unwrap())
                .unwrap();
        assert_eq!(back, second);
    }
}
