use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;

use super::ensure_within;
use crate::error::Result;

/// A single entry in the file tree.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    /// Display name (final path component).
    pub name: String,
    /// Absolute path on disk.
    pub path: String,
    /// `true` for directories, `false` for files.
    pub is_dir: bool,
    /// Last-modified time in milliseconds since the epoch, when the platform
    /// reports one. Only the tree's "sort by modified" reads it.
    pub modified: Option<u64>,
}

/// Milliseconds since the epoch for a directory entry's mtime, if available.
fn modified_ms(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// Build an `ignore` Override that *excludes* the given globs. Override globs use
/// gitignore semantics with `!` inverted, so a leading `!` makes a glob an ignore.
/// Empty/blank patterns are skipped. Applied on top of (not instead of) gitignore.
pub(crate) fn exclude_overrides(
    root: &PathBuf,
    exclude: &[String],
) -> Option<ignore::overrides::Override> {
    glob_overrides(root, &[], exclude)
}

/// Overrides from a positive `include` list and a negative `exclude` list.
///
/// A non-empty `include` restricts the walk to files matching it (the `ignore`
/// crate's rule: once any positive glob exists, a file must match one to be
/// walked), which is what "files to include" in the search panel means.
pub(crate) fn glob_overrides(
    root: &PathBuf,
    include: &[String],
    exclude: &[String],
) -> Option<ignore::overrides::Override> {
    let mut b = ignore::overrides::OverrideBuilder::new(root);
    let mut any = false;
    for g in include {
        let g = g.trim();
        if !g.is_empty() && b.add(g).is_ok() {
            any = true;
        }
    }
    for g in exclude {
        let g = g.trim();
        if g.is_empty() {
            continue;
        }
        if b.add(&format!("!{g}")).is_ok() {
            any = true;
        }
    }
    if !any {
        return None;
    }
    b.build().ok()
}

/// List the immediate children of `dir`, honouring ignore rules unless
/// `show_hidden` is set. Directories sort before files, each alphabetically.
///
/// `root` is the project root; ignore rules are resolved relative to it so that
/// listing a nested directory still applies the repository's `.gitignore`.
#[tauri::command]
pub fn list_dir(
    root: String,
    dir: String,
    show_hidden: bool,
    exclude: Vec<String>,
) -> Result<Vec<DirEntry>> {
    let root = PathBuf::from(&root);
    let dir = ensure_within(&root, &PathBuf::from(&dir))?;

    let mut walk = WalkBuilder::new(&dir);
    walk.max_depth(Some(1)) // immediate children only — lazy expansion
        .hidden(!show_hidden) // hide dotfiles unless asked
        .ignore(!show_hidden)
        .git_ignore(!show_hidden)
        .git_global(!show_hidden)
        .git_exclude(!show_hidden)
        .parents(true); // honour ignore files in ancestor directories

    // The user's excludes are intent, applied even when hidden/ignored are shown.
    if let Some(ov) = exclude_overrides(&root, &exclude) {
        walk.overrides(ov);
    }
    let mut entries: Vec<DirEntry> = walk
        .build()
        .filter_map(|r| r.ok())
        .filter(|entry| entry.path() != dir) // WalkBuilder yields the root itself
        .map(|entry| {
            let path = entry.path();
            DirEntry {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                path: path.to_string_lossy().into_owned(),
                is_dir: entry.file_type().is_some_and(|t| t.is_dir()),
                modified: modified_ms(path),
            }
        })
        .collect();

    // Always surface `.env*` files even when hidden/ignored are filtered out:
    // they're never committed, but the reader still needs to see and open them.
    // (Overrides in the `ignore` crate don't bypass its `hidden` dotfile filter,
    // so merge them in directly.)
    if !show_hidden {
        let have: std::collections::HashSet<String> =
            entries.iter().map(|e| e.path.clone()).collect();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if !name.starts_with(".env") {
                    continue;
                }
                let path = e.path();
                let p = path.to_string_lossy().into_owned();
                if !have.contains(&p) {
                    entries.push(DirEntry {
                        modified: modified_ms(&path),
                        name,
                        is_dir: path.is_dir(),
                        path: p,
                    });
                }
            }
        }
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Hard cap on the number of files returned to the fuzzy finder. Beyond this,
/// fuzzy ranking in the webview stops being interactive; the cap keeps Cmd+P
/// instant even on enormous monorepos.
pub(super) const MAX_INDEXED_FILES: usize = 50_000;

/// Walk the whole project (gitignore-aware) and return every file's path, for
/// the fuzzy file finder. Directories and ignored paths are excluded.
/// `async` for the same reason as `git_info`: a full recursive walk of a large
/// project on the main thread freezes the window, and the file tree re-runs it
/// on every save.
#[tauri::command(async)]
pub fn list_files(root: String, exclude: Vec<String>) -> Result<Vec<String>> {
    let root = PathBuf::from(&root);
    let mut walk = WalkBuilder::new(&root);
    walk.hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true);
    if let Some(ov) = exclude_overrides(&root, &exclude) {
        walk.overrides(ov);
    }
    let files = walk
        .build()
        .filter_map(|r| r.ok())
        .filter(|entry| entry.file_type().is_some_and(|t| t.is_file()))
        .take(MAX_INDEXED_FILES)
        // Return project-relative paths: the rest of the app (comment anchors,
        // read_file) works in terms of the root, and consumers prepend it.
        .map(|entry| {
            let p = entry.path();
            p.strip_prefix(&root)
                .unwrap_or(p)
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directories_sort_before_files() {
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        std::fs::create_dir(root.join("z_dir")).unwrap();
        std::fs::write(root.join("a.txt"), "").unwrap();
        let entries = list_dir(
            root.to_string_lossy().into_owned(),
            root.to_string_lossy().into_owned(),
            false,
            vec![],
        )
        .unwrap();
        // Folders first regardless of name — the tree's whole shape depends on
        // it, and every other test here only checks membership.
        assert!(
            entries[0].is_dir,
            "expected z_dir first, got {:?}",
            entries[0]
        );
    }

    #[test]
    fn list_dir_honours_exclude_globs() {
        use std::fs;
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("keep.txt"), b"a").unwrap();
        fs::write(root.join("skip.log"), b"b").unwrap();

        let names = |exclude: Vec<String>| {
            super::list_dir(s(root.into()), s(root.into()), false, exclude)
                .unwrap()
                .into_iter()
                .map(|e| e.name)
                .collect::<Vec<_>>()
        };

        // No excludes → everything shows.
        assert!(names(vec![]).contains(&"node_modules".to_string()));
        // Excluding a dir and a glob hides both; unrelated entries remain.
        let filtered = names(vec!["node_modules".into(), "*.log".into()]);
        assert!(!filtered.contains(&"node_modules".to_string()));
        assert!(!filtered.contains(&"skip.log".to_string()));
        assert!(filtered.contains(&"src".to_string()));
        assert!(filtered.contains(&"keep.txt".to_string()));
        // Blank/empty patterns are ignored, not errors.
        assert!(names(vec!["".into(), "  ".into()]).contains(&"src".to_string()));
    }
}
