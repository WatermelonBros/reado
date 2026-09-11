//! Local file history: a copy of each project file's previous content, kept on
//! every save, independent of git.
//!
//! The case this exists for is the one version control cannot answer: twenty
//! minutes of work on a file that was never committed, an edit that destroyed
//! the good version, and undo already spent. Git has nothing to say about a file
//! it has never seen; this does.
//!
//! Copies live under `.reado/.history/<encoded relative path>/<nanos>`, the same
//! scratch space as `.reado/.undo/`: not versioned, not shown in the tree,
//! bounded by both a count and an age so a long-lived project cannot grow one
//! copy per save forever.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::Result;

/// Where the copies live, under the project's own `.reado/`.
const DIR: &str = ".history";

/// Copies kept per file. Fifty saves back is a working afternoon.
const MAX_ENTRIES: usize = 50;

/// How long a copy is kept regardless of count.
const MAX_AGE_NANOS: u128 = 30 * 24 * 60 * 60 * 1_000_000_000;

/// One parked copy: when it was taken, and how big it was.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    /// Nanoseconds since the epoch, as a string — the file's own name, and the
    /// key `history_read` takes. A string because a u128 does not survive JSON.
    pub stamp: String,
    pub size: u64,
}

/// Nanoseconds since the epoch, or 0 if the clock is before it.
fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
}

/// The directory holding one file's copies.
///
/// The relative path becomes one directory name: `/` and `%` are escaped, so
/// `src/a.ts` and `src%2Fa.ts` cannot collide, and the name stays readable for
/// anyone who goes looking.
fn dir_for(root: &Path, rel: &str) -> PathBuf {
    let encoded = rel.replace('%', "%25").replace('/', "%2F");
    root.join(".reado").join(DIR).join(encoded)
}

/// Entries in one file's directory, newest first.
fn entries(dir: &Path) -> Vec<(u128, u64)> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<(u128, u64)> = read
        .flatten()
        .filter_map(|e| {
            let stamp = e.file_name().to_string_lossy().parse::<u128>().ok()?;
            Some((stamp, e.metadata().ok()?.len()))
        })
        .collect();
    out.sort_unstable_by_key(|e| std::cmp::Reverse(e.0));
    out
}

/// Drop what no reader can reach: everything past `MAX_ENTRIES`, and everything
/// older than `MAX_AGE_NANOS`.
fn prune(dir: &Path) {
    let now = now_nanos();
    for (i, (stamp, _)) in entries(dir).into_iter().enumerate() {
        if i >= MAX_ENTRIES || now.saturating_sub(stamp) > MAX_AGE_NANOS {
            let _ = std::fs::remove_file(dir.join(stamp.to_string()));
        }
    }
}

/// Park a copy of `path`'s current bytes before something overwrites them.
///
/// Best-effort by construction: it is called on the way to a save, and a save
/// must never fail because its snapshot could not be written. A file whose
/// newest copy is byte-identical adds nothing — saving with no changes is the
/// most common save there is.
pub fn snapshot(root: &Path, rel: &str, target: &Path) {
    let Ok(current) = std::fs::read(target) else {
        return; // A file that does not exist yet has no previous content.
    };
    let dir = dir_for(root, rel);
    if let Some((newest, _)) = entries(&dir).first() {
        if std::fs::read(dir.join(newest.to_string())).is_ok_and(|prev| prev == current) {
            return;
        }
    }
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let _ = std::fs::write(dir.join(now_nanos().to_string()), current);
    prune(&dir);
}

/// The copies kept for one project file, newest first.
#[tauri::command]
pub fn history_list(root: String, path: String) -> Result<Vec<HistoryEntry>> {
    let root = PathBuf::from(&root);
    // Confine the *file* the history is about; the history directory itself is
    // derived from it and never comes from the caller.
    crate::fs::ensure_within(&root, &PathBuf::from(&path))?;
    Ok(entries(&dir_for(&root, &path))
        .into_iter()
        .map(|(stamp, size)| HistoryEntry {
            stamp: stamp.to_string(),
            size,
        })
        .collect())
}

/// The content of one parked copy.
#[tauri::command]
pub fn history_read(root: String, path: String, stamp: String) -> Result<String> {
    let root = PathBuf::from(&root);
    crate::fs::ensure_within(&root, &PathBuf::from(&path))?;
    // The stamp names a file in a directory we chose: it must be digits, or it
    // is someone trying to read elsewhere.
    if !stamp.chars().all(|c| c.is_ascii_digit()) {
        return Err(crate::error::Error::Other("bad history stamp".into()));
    }
    Ok(std::fs::read_to_string(dir_for(&root, &path).join(stamp))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/a.ts"), "one").unwrap();
        dir
    }

    #[test]
    fn a_save_parks_the_previous_content_once_per_change() {
        let dir = project();
        let root = dir.path();
        let target = root.join("src/a.ts");

        snapshot(root, "src/a.ts", &target);
        assert_eq!(
            history_list(root.to_string_lossy().into(), "src/a.ts".into())
                .unwrap()
                .len(),
            1
        );

        // Saving again with the same bytes adds nothing: that is the most common
        // save there is, and it would otherwise fill the history with copies of
        // one version.
        snapshot(root, "src/a.ts", &target);
        assert_eq!(
            history_list(root.to_string_lossy().into(), "src/a.ts".into())
                .unwrap()
                .len(),
            1
        );

        std::fs::write(&target, "two").unwrap();
        snapshot(root, "src/a.ts", &target);
        let listed = history_list(root.to_string_lossy().into(), "src/a.ts".into()).unwrap();
        assert_eq!(listed.len(), 2);
        // Newest first, and it holds what was there before the change.
        let newest = history_read(
            root.to_string_lossy().into(),
            "src/a.ts".into(),
            listed[0].stamp.clone(),
        )
        .unwrap();
        assert_eq!(newest, "two");
    }

    #[test]
    fn the_history_is_bounded_by_count_and_by_age() {
        let dir = project();
        let root = dir.path();
        let hist = dir_for(root, "src/a.ts");
        std::fs::create_dir_all(&hist).unwrap();
        let now = now_nanos();
        // Sixty recent copies and one from last year.
        for i in 0..60u128 {
            std::fs::write(hist.join((now - i).to_string()), "x").unwrap();
        }
        let ancient = now - 365 * 24 * 60 * 60 * 1_000_000_000;
        std::fs::write(hist.join(ancient.to_string()), "old").unwrap();

        prune(&hist);

        let listed = history_list(root.to_string_lossy().into(), "src/a.ts".into()).unwrap();
        assert_eq!(listed.len(), MAX_ENTRIES);
        assert!(!hist.join(ancient.to_string()).exists());
    }

    #[test]
    fn a_path_outside_the_project_is_refused() {
        let dir = project();
        let root = dir.path().to_string_lossy().into_owned();
        assert!(history_list(root.clone(), "../secrets.txt".into()).is_err());
        assert!(history_read(root.clone(), "src/a.ts".into(), "../../etc/passwd".into()).is_err());
    }

    #[test]
    fn two_files_whose_names_could_collide_keep_separate_histories() {
        let dir = project();
        let root = dir.path();
        assert_ne!(dir_for(root, "src/a.ts"), dir_for(root, "src%2Fa.ts"));
    }
}
