use std::path::{Path, PathBuf};

use super::{ensure_ancestor_within, ensure_dest_within, ensure_within, now_nanos};
use crate::error::{Error, Result};

/// Append " N" before the extension until the path is free, so importing a
/// duplicate name never clobbers an existing file.
pub(crate) fn unique_dest(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    (1..)
        .map(|n| parent.join(format!("{stem} {n}{ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

/// Copy a file or directory tree (std has no recursive copy).
fn copy_path(src: &Path, dest: &Path) -> Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dest)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_path(&entry.path(), &dest.join(entry.file_name()))?;
        }
    } else {
        std::fs::copy(src, dest)?;
    }
    Ok(())
}

/// Create a new empty directory at `path` (project-relative), making parent dirs
/// as needed. Confined to `root`; errors if something is already there. Returns
/// its absolute path.
#[tauri::command]
pub fn create_dir(root: String, path: String) -> Result<String> {
    let root = PathBuf::from(&root);
    let target = root.join(&path);
    ensure_ancestor_within(&root, &target)?;
    // `ensure_dest_within` canonicalizes the parent, so the parent has to exist
    // first — same order as create_file, and safe because the ancestor guard
    // above already refused anything resolving outside the root.
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let target = ensure_dest_within(&root, &target)?;
    if target.exists() {
        return Err(Error::Other(
            "something with that name already exists".into(),
        ));
    }
    std::fs::create_dir(&target)?;
    crate::log::info(
        "fs",
        "folder created",
        serde_json::json!({ "path": target.to_string_lossy() }),
    );
    Ok(target.to_string_lossy().into_owned())
}

/// Move/rename a file or directory within the project (internal drag-and-drop).
/// Both ends are confined to the root; refuses to overwrite an existing target.
#[tauri::command]
pub fn move_path(root: String, from: String, to: String) -> Result<()> {
    let root = PathBuf::from(&root);
    let src = ensure_within(&root, &PathBuf::from(&from))?;
    let dest = ensure_dest_within(&root, &PathBuf::from(&to))?;
    if dest == src {
        return Ok(());
    }
    if dest.exists() {
        return Err(Error::Other(
            "a file with that name already exists here".into(),
        ));
    }
    std::fs::rename(&src, &dest)?;
    crate::log::info(
        "fs",
        "path moved",
        serde_json::json!({ "from": src.to_string_lossy(), "to": dest.to_string_lossy() }),
    );
    Ok(())
}

/// Delete a file/folder by moving it into the project's own trash
/// (`.reado/.trash/`), so the removal is reversible (Cmd/Ctrl+Z restores it by
/// moving it back). Returns the absolute trashed path. Confined to the root.
#[tauri::command]
pub fn trash_path(root: String, path: String) -> Result<String> {
    let root = PathBuf::from(&root);
    let src = ensure_within(&root, &PathBuf::from(&path))?;
    let name = src.file_name().ok_or(Error::PathEscapesRoot)?;
    let trash = root.join(".reado").join(".trash");
    std::fs::create_dir_all(&trash)?;
    // A monotonic-ish prefix keeps same-named deletions from clashing; unique_dest
    // is the final guard.
    let stamp = now_nanos();
    let dest = unique_dest(&trash.join(format!("{stamp}__{}", name.to_string_lossy())));
    std::fs::rename(&src, &dest)?;
    crate::log::info(
        "fs",
        "path trashed",
        serde_json::json!({ "from": src.to_string_lossy(), "to": dest.to_string_lossy() }),
    );
    Ok(dest.to_string_lossy().into_owned())
}

/// Copy external files/directories (absolute OS paths) into `dest_dir` inside the
/// project — the target of an outside-the-app drag-and-drop. Sources may live
/// anywhere; the destination is confined to the root.
#[tauri::command]
pub fn import_paths(root: String, sources: Vec<String>, dest_dir: String) -> Result<()> {
    let root = PathBuf::from(&root);
    let dir = ensure_within(&root, &PathBuf::from(&dest_dir))?;
    if !dir.is_dir() {
        return Err(Error::Other("destination is not a folder".into()));
    }
    let count = sources.len();
    for src in sources {
        let src = PathBuf::from(&src);
        let name = src.file_name().ok_or(Error::PathEscapesRoot)?;
        copy_path(&src, &unique_dest(&dir.join(name)))?;
    }
    crate::log::info(
        "fs",
        "paths imported",
        serde_json::json!({ "count": count, "dest": dir.to_string_lossy() }),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_escaping_folder_create_leaves_nothing_outside_the_project() {
        // Same property as the file case: `create_dir_all` would happily build
        // the whole escaping chain if the ancestor guard didn't run first.
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path().join("proj");
        std::fs::create_dir(&root).unwrap();

        let out = create_dir(
            root.to_string_lossy().into_owned(),
            "../escaped/nested".into(),
        );
        assert!(out.is_err());
        assert!(!proj.path().join("escaped").exists());
    }

    #[test]
    fn creates_a_folder_and_refuses_a_second_one_with_the_same_name() {
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path().to_string_lossy().into_owned();
        assert!(create_dir(root.clone(), "a/b".into()).is_ok());
        assert!(proj.path().join("a/b").is_dir());
        assert!(create_dir(root, "a/b".into()).is_err());
    }

    #[test]
    fn move_import_and_root_confinement() {
        use std::fs;
        let proj = tempfile::TempDir::new().unwrap();
        let ext = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();

        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("a.txt"), b"hi").unwrap();

        // Move a.txt into sub/.
        super::move_path(
            s(root.into()),
            s(root.join("a.txt")),
            s(root.join("sub/a.txt")),
        )
        .unwrap();
        assert!(root.join("sub/a.txt").exists() && !root.join("a.txt").exists());

        // Import an external file twice — the second gets a non-clobbering name.
        fs::write(ext.path().join("x.txt"), b"x").unwrap();
        let src = vec![s(ext.path().join("x.txt"))];
        super::import_paths(s(root.into()), src.clone(), s(root.into())).unwrap();
        super::import_paths(s(root.into()), src, s(root.into())).unwrap();
        assert!(root.join("x.txt").exists() && root.join("x 1.txt").exists());

        // Escaping the root is refused.
        assert!(super::move_path(
            s(root.into()),
            s(root.join("sub/a.txt")),
            s(ext.path().join("a.txt")),
        )
        .is_err());
    }
}
