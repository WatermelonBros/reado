//! Filesystem commands: gitignore-aware directory listing and file reading.
//!
//! Directory listing reuses ripgrep's [`ignore`] crate so the file tree honours
//! exactly the same ignore rules (`.gitignore`, `.ignore`, global excludes) that
//! Reado's full-text search does. Listing is lazy — one directory level at a
//! time — so even very large repositories open instantly.

use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;

use crate::error::{Error, Result};

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
}

/// Reject paths that resolve outside `root` (defends against `..` traversal).
fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf> {
    let root = root.canonicalize()?;
    let target = target.canonicalize()?;
    if target.starts_with(&root) {
        Ok(target)
    } else {
        Err(Error::PathEscapesRoot)
    }
}

/// List the immediate children of `dir`, honouring ignore rules unless
/// `show_hidden` is set. Directories sort before files, each alphabetically.
///
/// `root` is the project root; ignore rules are resolved relative to it so that
/// listing a nested directory still applies the repository's `.gitignore`.
#[tauri::command]
pub fn list_dir(root: String, dir: String, show_hidden: bool) -> Result<Vec<DirEntry>> {
    let root = PathBuf::from(&root);
    let dir = ensure_within(&root, &PathBuf::from(&dir))?;

    let mut entries: Vec<DirEntry> = WalkBuilder::new(&dir)
        .max_depth(Some(1)) // immediate children only — lazy expansion
        .hidden(!show_hidden) // hide dotfiles unless asked
        .ignore(!show_hidden)
        .git_ignore(!show_hidden)
        .git_global(!show_hidden)
        .git_exclude(!show_hidden)
        .parents(true) // honour ignore files in ancestor directories
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
            }
        })
        .collect();

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
const MAX_INDEXED_FILES: usize = 50_000;

/// Walk the whole project (gitignore-aware) and return every file's path, for
/// the fuzzy file finder. Directories and ignored paths are excluded.
#[tauri::command]
pub fn list_files(root: String) -> Result<Vec<String>> {
    let root = PathBuf::from(&root);
    let files = WalkBuilder::new(&root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
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

/// How a file's bytes were interpreted for the frontend.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileContent {
    /// UTF-8 text (code, markdown, JSON, …).
    Text { text: String },
    /// An image, returned as a `data:` URL ready to drop into `<img src>`.
    /// (`rename_all` on an enum only renames variants, not their fields, so the
    /// camelCase frontend name must be set explicitly.)
    Image {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    /// Binary, non-image file — rendered as an unsupported-preview placeholder.
    Binary { size: u64 },
}

/// Largest text file we load eagerly (8 MiB). Larger files are still read; the
/// cap exists only to avoid pulling, say, a 1 GiB log fully into the webview.
const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;

fn image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("svg") => Some("image/svg+xml"),
        Some("bmp") => Some("image/bmp"),
        Some("ico") => Some("image/x-icon"),
        _ => None,
    }
}

/// Write UTF-8 text back to a file (optional manual editing). The path is
/// confined to the project root.
#[tauri::command]
pub fn write_file(root: String, path: String, content: String) -> Result<()> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    std::fs::write(path, content)?;
    Ok(())
}

/// Create a new empty file at `path` (project-relative), making parent dirs as
/// needed. Confined to `root`; errors if the file already exists. Returns its
/// absolute path.
#[tauri::command]
pub fn create_file(root: String, path: String) -> Result<String> {
    let root = PathBuf::from(&root);
    let target = root.join(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let target = ensure_dest_within(&root, &target)?;
    if target.exists() {
        return Err(Error::Other("a file with that name already exists".into()));
    }
    std::fs::write(&target, "")?;
    Ok(target.to_string_lossy().into_owned())
}

/// Read a file for display. Detects images (returned as data URLs) and binary
/// files (returned as a size-only placeholder); everything else is UTF-8 text.
#[tauri::command]
pub fn read_file(root: String, path: String, as_text: Option<bool>) -> Result<FileContent> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    let metadata = std::fs::metadata(&path)?;

    // `as_text` forces source decoding for image-renderable formats (e.g. SVG).
    if as_text != Some(true) {
        if let Some(mime) = image_mime(&path) {
            let bytes = std::fs::read(&path)?;
            let encoded = base64_encode(&bytes);
            return Ok(FileContent::Image {
                data_url: format!("data:{mime};base64,{encoded}"),
            });
        }
    }

    let bytes = std::fs::read(&path)?;
    // A NUL byte in the first 8 KiB is a reliable "this is binary" signal.
    let probe = &bytes[..bytes.len().min(8192)];
    let looks_binary = probe.contains(&0);

    if looks_binary || metadata.len() > MAX_TEXT_BYTES {
        return Ok(FileContent::Binary {
            size: metadata.len(),
        });
    }

    match String::from_utf8(bytes) {
        Ok(text) => Ok(FileContent::Text { text }),
        Err(_) => Ok(FileContent::Binary {
            size: metadata.len(),
        }),
    }
}

/// Resolve a destination whose final component may not exist yet: the parent
/// directory must canonicalize inside `root`.
fn ensure_dest_within(root: &Path, target: &Path) -> Result<PathBuf> {
    let parent = target.parent().ok_or(Error::PathEscapesRoot)?;
    let parent = parent.canonicalize()?;
    if !parent.starts_with(&root.canonicalize()?) {
        return Err(Error::PathEscapesRoot);
    }
    let name = target.file_name().ok_or(Error::PathEscapesRoot)?;
    Ok(parent.join(name))
}

/// Append " N" before the extension until the path is free, so importing a
/// duplicate name never clobbers an existing file.
fn unique_dest(path: &Path) -> PathBuf {
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
    Ok(())
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
    for src in sources {
        let src = PathBuf::from(&src);
        let name = src.file_name().ok_or(Error::PathEscapesRoot)?;
        copy_path(&src, &unique_dest(&dir.join(name)))?;
    }
    Ok(())
}

/// Minimal standard base64 encoder (avoids pulling in a crate for one use).
/// Also used to frame PTY output for the terminal.
pub(crate) fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | (b[2] as u32);
        out.push(ALPHABET[(n >> 18 & 63) as usize] as char);
        out.push(ALPHABET[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Resolve a relative import specifier (`./foo`, `../lib/bar`) from `from_file`
/// to an existing file inside `root`, trying the usual extensions and `index`
/// files. Returns the absolute path, or `None` when nothing resolves. Used for
/// modifier-click navigation on import paths.
#[tauri::command]
pub fn resolve_import(root: String, from_file: String, spec: String) -> Result<Option<String>> {
    // Only relative specifiers — bare specs (npm packages) aren't navigable.
    if !(spec.starts_with("./") || spec.starts_with("../")) {
        return Ok(None);
    }
    let root = PathBuf::from(&root);
    let from_dir = PathBuf::from(&from_file);
    let base = from_dir.parent().unwrap_or(Path::new(".")).join(&spec);

    const EXTS: &[&str] = &[
        "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "rs",
    ];
    let mut candidates = vec![base.clone()];
    candidates.extend(
        EXTS.iter()
            .map(|ext| PathBuf::from(format!("{}.{ext}", base.display()))),
    );
    candidates.extend(
        ["ts", "tsx", "js", "jsx"]
            .iter()
            .map(|ext| base.join(format!("index.{ext}"))),
    );

    for cand in candidates {
        if cand.is_file() {
            if let Ok(p) = ensure_within(&root, &cand) {
                return Ok(Some(p.to_string_lossy().into_owned()));
            }
        }
    }
    Ok(None)
}

/// Resolve a path printed in the terminal (`src/foo.ts`, or an absolute path) to
/// an existing file inside `root`. Returns the absolute path, or `None`. Used to
/// make `path:line:col` in agent/build output clickable.
#[tauri::command]
pub fn resolve_path(root: String, spec: String) -> Result<Option<String>> {
    let root = PathBuf::from(&root);
    let p = PathBuf::from(&spec);
    let cand = if p.is_absolute() { p } else { root.join(&spec) };
    if cand.is_file() {
        if let Ok(abs) = ensure_within(&root, &cand) {
            return Ok(Some(abs.to_string_lossy().into_owned()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::base64_encode;

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

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }
}
