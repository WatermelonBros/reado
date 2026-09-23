//! Per-project files under `.reado/`: the config, the named project-shared
//! files, and the `.gitignore` rule.

use std::path::Path;

use crate::store::{reado_dir, CONFIG_FILE};
use crate::{Error, Result};

/// Read the per-project config (`.reado/config.json`) as raw JSON, or `None`
/// when absent. Per-project settings override the user's global settings.
pub fn read_config(root: &str) -> Option<String> {
    std::fs::read_to_string(reado_dir(root).join(CONFIG_FILE)).ok()
}

/// Read a named file from the project's `.reado/` directory, or `None` when it
/// is absent.
///
/// `name` must be a bare file name: these files are shared through the
/// repository, so the *project* chooses their content, and a path with
/// separators or `..` in it would let that choice reach outside `.reado/`.
pub fn read_reado_file(root: &str, name: &str) -> Option<String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return None;
    }
    std::fs::read_to_string(reado_dir(root).join(name)).ok()
}

/// Write a named file into the project's `.reado/` directory.
///
/// Same filename rule as [`read_reado_file`]: a bare name, so a project-shared
/// file can never be written outside `.reado/`.
pub fn write_reado_file(root: &str, name: &str, content: &str) -> Result<()> {
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid .reado file name",
        )));
    }
    let dir = reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(name), content)?;
    Ok(())
}

/// Write the per-project config (`.reado/config.json`). `json` is stored verbatim.
pub fn write_config(root: &str, json: &str) -> Result<()> {
    let dir = reado_dir(root);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(CONFIG_FILE), json)?;
    Ok(())
}

/// Everything under `.reado/` that belongs to one machine or one person rather
/// than to the project: the rebuildable indexes, the deleted files waiting for an
/// undo, the pre-replace copies behind ⌘Z, and how far you have read.
///
/// The single list, so the ignore rule and the test that guards it cannot drift
/// apart — `semantic.sqlite`, `read.json` and `read-snapshots.json` were all
/// missing from the rule *and* from the test, which is exactly how a rule with a
/// hand-copied test goes stale.
///
/// The databases are matched by glob rather than by name: they run in WAL mode,
/// so SQLite keeps a `-wal` and a `-shm` beside each one while it is open and
/// leaves them behind after a crash. Naming the files one at a time is how this
/// list went stale the first time.
pub const MACHINE_LOCAL: &[&str] = &[
    ".reado/*.sqlite*",
    ".reado/read.json",
    ".reado/read-snapshots.json",
    ".reado/.trash/",
    ".reado/.undo/",
    ".reado/.history/",
];

/// Add `.reado/` (or just the index when versioning) to the project `.gitignore`.
/// Idempotent.
pub fn add_reado_gitignore(root: &str, versioned: bool) -> Result<()> {
    let gitignore = Path::new(root).join(".gitignore");
    // Versioning `.reado/` means versioning the *annotations*. The rest of what
    // lives there is machine-local scratch — two rebuildable indexes, deleted
    // files waiting for an undo, the pre-replace copies behind ⌘Z, and how far
    // *you* have read — and committing any of it would push one person's undo
    // history, or their reading, to everyone else.
    //
    // Keep this list level with what actually lands in `.reado/`: every entry
    // here was once missing, and a missing one is committed the day someone
    // turns versioning on.
    let entries: &[&str] = if versioned {
        MACHINE_LOCAL
    } else {
        &[".reado/"]
    };
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    let mut content = existing.clone();
    for entry in entries {
        if existing.lines().any(|l| l.trim() == *entry) {
            continue;
        }
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(entry);
        content.push('\n');
    }
    if content == existing {
        return Ok(());
    }
    std::fs::write(gitignore, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reado_file_name_cannot_climb_out_of_the_directory() {
        // These files are named by the *project* (snippets, recommended
        // extensions, the workspace list), so the name is untrusted input.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        std::fs::write(dir.path().join("secret.txt"), "safe").unwrap();

        for name in ["../secret.txt", "sub/x.json", "..\\secret.txt", ""] {
            assert!(read_reado_file(&root, name).is_none(), "read {name}");
            assert!(
                write_reado_file(&root, name, "pwned").is_err(),
                "write {name}"
            );
        }
        assert_eq!(
            std::fs::read_to_string(dir.path().join("secret.txt")).unwrap(),
            "safe"
        );
    }

    #[test]
    fn a_reado_file_round_trips_under_the_reado_directory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        assert!(read_reado_file(&root, "workspace.json").is_none());
        write_reado_file(&root, "workspace.json", "{}").unwrap();
        assert_eq!(
            read_reado_file(&root, "workspace.json").as_deref(),
            Some("{}")
        );
        assert!(dir.path().join(".reado/workspace.json").exists());
    }

    #[test]
    fn gitignoring_reado_takes_the_whole_directory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        add_reado_gitignore(&root, false).unwrap();
        let ignored = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(ignored, ".reado/\n");
    }

    #[test]
    fn versioning_reado_still_keeps_the_machine_local_parts_out() {
        // Versioning `.reado/` means versioning the annotations. The index, the
        // trash and the pre-replace copies behind undo are one machine's scratch
        // — committing them would push your undo history to everyone else.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        add_reado_gitignore(&root, true).unwrap();
        let ignored = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        for entry in MACHINE_LOCAL {
            assert!(ignored.lines().any(|l| l == *entry), "missing {entry}");
        }
    }

    #[test]
    fn the_machine_local_rules_match_what_reado_writes() {
        // Restating the list would only prove it equals itself. Match real names
        // — including the sidecars WAL leaves beside an open database — against
        // the patterns, the way git will.
        let globs: Vec<globset::GlobMatcher> = MACHINE_LOCAL
            .iter()
            .map(|p| globset::Glob::new(p).unwrap().compile_matcher())
            .collect();
        for written in [
            ".reado/index.sqlite",
            ".reado/semantic.sqlite",
            ".reado/semantic.sqlite-wal",
            ".reado/semantic.sqlite-shm",
            ".reado/read.json",
            ".reado/read-snapshots.json",
        ] {
            assert!(
                globs.iter().any(|g| g.is_match(written)),
                "{written} is written by Reado but no rule ignores it"
            );
        }
    }

    #[test]
    fn gitignoring_is_idempotent_and_keeps_what_is_already_there() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        std::fs::write(dir.path().join(".gitignore"), "node_modules").unwrap();
        add_reado_gitignore(&root, true).unwrap();
        let once = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        add_reado_gitignore(&root, true).unwrap();
        let twice = std::fs::read_to_string(dir.path().join(".gitignore")).unwrap();
        assert_eq!(once, twice);
        assert!(twice.starts_with("node_modules\n"));
    }
}
