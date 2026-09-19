//! Filesystem commands: gitignore-aware directory listing and file reading.
//!
//! Directory listing reuses ripgrep's [`ignore`] crate so the file tree honours
//! exactly the same ignore rules (`.gitignore`, `.ignore`, global excludes) that
//! Reado's full-text search does. Listing is lazy — one directory level at a
//! time — so even very large repositories open instantly.

use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;

use crate::encoding::Charset;
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
    /// Last-modified time in milliseconds since the epoch, when the platform
    /// reports one. Only the tree's "sort by modified" reads it.
    pub modified: Option<u64>,
}

/// Nanoseconds since the epoch, or 0 if the clock is before it.
pub(crate) fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
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

/// Reject paths that resolve outside `root` (defends against `..` traversal).
///
/// `target` may be absolute or project-relative — the frontend sends both (the
/// editor reads by absolute path but saves by relative one). A relative target
/// is resolved against `root`, never against the process's working directory:
/// canonicalizing `src/foo.ts` as-is would look for it next to wherever Reado
/// happened to be launched from, and fail with a bare ENOENT. `join` leaves an
/// absolute target untouched, so callers that already joined are unaffected.
pub(crate) fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf> {
    let root = root.canonicalize()?;
    let target = root.join(target).canonicalize()?;
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
const MAX_INDEXED_FILES: usize = 50_000;

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

/// How a file's bytes were interpreted for the frontend.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileContent {
    /// Decoded text (code, markdown, JSON, …), with the encoding it was read
    /// as — so the editor can say so, and write it back the same way.
    Text {
        text: String,
        encoding: crate::encoding::Charset,
    },
    /// An image, returned as a `data:` URL ready to drop into `<img src>`.
    /// (`rename_all` on an enum only renames variants, not their fields, so the
    /// camelCase frontend name must be set explicitly.)
    Image {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    /// A PDF, returned as a `data:` URL for the in-app pdf.js viewer.
    Pdf {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    /// Binary, non-image file — rendered as an unsupported-preview placeholder.
    Binary { size: u64 },
    /// Text, but past the user's large-file guard. Not read: the point of the
    /// guard is that a 40 MB minified bundle never reaches the editor unless the
    /// user asks for it, and reading it "just to be sure" would defeat that.
    Large { size: u64 },
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

/// The project-relative path local history should file a write under, or `None`
/// for a write that has no business in the history (anything under `.reado/`).
fn history_key(root: &Path, target: &Path) -> Option<String> {
    let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let resolved = std::fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let rel = resolved
        .strip_prefix(&root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    (!rel.is_empty() && !rel.starts_with(".reado/")).then_some(rel)
}

/// Write UTF-8 text back to a file (optional manual editing). The path is
/// confined to the project root.
#[tauri::command]
pub fn write_file(
    root: String,
    path: String,
    content: String,
    encoding: Option<String>,
) -> Result<()> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    // Write the file back as the encoding it was read as. Refusing when the text
    // no longer fits is the point: silently substituting "?" for a character the
    // encoding can't hold is data loss disguised as a successful save.
    let charset = encoding.as_deref().map(Charset::from_label);
    let out = match charset {
        None | Some(Charset::Utf8) => content.into_bytes(),
        Some(cs) => crate::encoding::encode(&content, cs).ok_or_else(|| {
            Error::Other(format!(
                "this text can't be written as {} — save it as UTF-8 instead",
                cs.label()
            ))
        })?,
    };
    // Park the previous content first: local history is the answer to "I saved
    // over the good version and undo is spent", and every write Reado makes to a
    // project file comes through here. The key is derived from the *resolved*
    // target, not from the caller's string — callers pass both relative and
    // absolute paths, and an absolute one would key the history by the whole
    // path. `.reado/` is Reado's own scratch and config: snapshotting it would
    // be keeping a history of the history.
    if let Some(rel) = history_key(&root, &path) {
        crate::history::snapshot(&root, &rel, &path);
    }
    let bytes = out.len();
    std::fs::write(&path, out).inspect_err(|e| {
        crate::log::error(
            "fs",
            "write failed",
            serde_json::json!({ "path": path.to_string_lossy(), "error": e.to_string() }),
        );
    })?;
    crate::log::info(
        "fs",
        "file written",
        serde_json::json!({ "path": path.to_string_lossy(), "bytes": bytes }),
    );
    Ok(())
}

/// Create a new empty file at `path` (project-relative), making parent dirs as
/// needed. Confined to `root`; errors if the file already exists. Returns its
/// absolute path.
#[tauri::command]
pub fn create_file(root: String, path: String) -> Result<String> {
    let root = PathBuf::from(&root);
    let target = root.join(&path);
    ensure_ancestor_within(&root, &target)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let target = ensure_dest_within(&root, &target)?;
    if target.exists() {
        return Err(Error::Other("a file with that name already exists".into()));
    }
    std::fs::write(&target, "")?;
    crate::log::info(
        "fs",
        "file created",
        serde_json::json!({ "path": target.to_string_lossy() }),
    );
    Ok(target.to_string_lossy().into_owned())
}

/// Read a file for display. Detects images (returned as data URLs) and binary
/// files (returned as a size-only placeholder); everything else is UTF-8 text.
///
/// `guard_bytes` is the user's large-file guard: a text file above it comes back
/// as `Large` without being read, so the editor can offer "open anyway" instead
/// of freezing on a generated bundle. `None` or `0` turns the guard off — which
/// is what the bypass passes.
#[tauri::command]
pub fn read_file(
    root: String,
    path: String,
    as_text: Option<bool>,
    guard_bytes: Option<u64>,
    encoding: Option<String>,
) -> Result<FileContent> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    // Name the file here or nowhere: the IPC trace logs argument *keys* only, so
    // "read_file failed" on its own leaves no way to tell an optional sidecar
    // that was merely absent from a file the app genuinely needed.
    let metadata = std::fs::metadata(&path).inspect_err(|e| {
        crate::log::debug(
            "fs",
            "read failed",
            serde_json::json!({ "path": path.to_string_lossy(), "error": e.to_string() }),
        );
    })?;

    // `as_text` forces source decoding for image-renderable formats (e.g. SVG).
    if as_text != Some(true) {
        if let Some(mime) = image_mime(&path) {
            // Cap by metadata *before* reading so a giant image (e.g. a multi-GB
            // .svg/.bmp) isn't slurped whole and base64-expanded into memory.
            const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
            if metadata.len() > MAX_IMAGE_BYTES {
                return Ok(FileContent::Binary {
                    size: metadata.len(),
                });
            }
            let bytes = std::fs::read(&path)?;
            let encoded = base64_encode(&bytes);
            return Ok(FileContent::Image {
                data_url: format!("data:{mime};base64,{encoded}"),
            });
        }
        // PDFs render in the in-app pdf.js viewer — hand back the bytes as a data
        // URL, like images, but cap the size so a giant PDF isn't slurped whole.
        let is_pdf = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("pdf"));
        if is_pdf {
            const MAX_PDF_BYTES: u64 = 64 * 1024 * 1024;
            if metadata.len() > MAX_PDF_BYTES {
                return Ok(FileContent::Binary {
                    size: metadata.len(),
                });
            }
            let bytes = std::fs::read(&path)?;
            let encoded = base64_encode(&bytes);
            return Ok(FileContent::Pdf {
                data_url: format!("data:application/pdf;base64,{encoded}"),
            });
        }
    }

    // Reject oversized files by metadata *before* reading — a multi-GB file must
    // never be slurped into memory just to be classified as too large below.
    if metadata.len() > MAX_TEXT_BYTES {
        return Ok(FileContent::Binary {
            size: metadata.len(),
        });
    }

    // The user's own, lower threshold: checked on metadata for the same reason,
    // and reported as `Large` so the UI can offer to open it anyway.
    if let Some(guard) = guard_bytes.filter(|g| *g > 0) {
        if metadata.len() > guard {
            return Ok(FileContent::Large {
                size: metadata.len(),
            });
        }
    }

    let bytes = std::fs::read(&path)?;
    // An explicit choice ("Reopen with Encoding") is an instruction, not a hint:
    // it skips detection entirely, which is the only way to open a file the
    // heuristic gets wrong.
    let forced = encoding.as_deref().map(Charset::from_label);
    let Some(charset) = forced.or_else(|| Charset::detect_default(&bytes)) else {
        // Not text in any encoding we would guess at.
        return Ok(FileContent::Binary {
            size: metadata.len(),
        });
    };

    // A NUL byte in the first 8 KiB is a reliable "this is binary" signal — but
    // not for UTF-16, where every ASCII character carries a NUL padding byte.
    // Reading those as binary is one of the bugs this whole path fixes.
    let utf16 = matches!(charset, Charset::Utf16Le | Charset::Utf16Be);
    if !utf16 && bytes[..bytes.len().min(8192)].contains(&0) {
        return Ok(FileContent::Binary {
            size: metadata.len(),
        });
    }

    match crate::encoding::decode(&bytes, charset) {
        Some(text) => Ok(FileContent::Text {
            text,
            encoding: charset,
        }),
        None => Ok(FileContent::Binary {
            size: metadata.len(),
        }),
    }
}

/// Confine a destination whose parent may not exist yet, *before* anything is
/// created: canonicalize the nearest existing ancestor of `target` and reject
/// anything resolving outside `root`. Without this, a `..`-escaping path would
/// leave directories behind outside the project as a side effect of the
/// `create_dir_all` that has to run before `ensure_dest_within` can work.
fn ensure_ancestor_within(root: &Path, target: &Path) -> Result<()> {
    let canon_root = root.canonicalize()?;
    let anchor = target
        .ancestors()
        .find(|p| p.exists())
        .ok_or(Error::PathEscapesRoot)?;
    if !anchor.canonicalize()?.starts_with(&canon_root) {
        return Err(Error::PathEscapesRoot);
    }
    Ok(())
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
///
/// With `search`, a spec that doesn't exist under the root is looked up by
/// suffix across the indexed files. Agents and build tools print paths relative
/// to wherever they ran, or none at all (`Terminal.tsx:104`), so a root-join is
/// the minority case — without the fallback most clicks resolve to nothing.
/// Links between the project's own markdown documents.
///
/// The knowledge graph used to draw only containment — a document sits in a
/// folder, a comment sits on a file — which is what the file tree already shows,
/// and drawing it as a graph produced one hairball of look-alike nodes. The
/// relations a tree *can't* show are the links the documents make to each other,
/// and those are written in the markdown itself.
///
/// Reads each of `files` (project-relative) and returns the `(from, to)` pairs
/// whose target resolves to another file in that same list. Inline links
/// (`[text](../other.md)`) and reference definitions both count; anything
/// off-project — a URL, a missing file, a link to code — is dropped.
#[tauri::command]
pub fn doc_links(root: String, files: Vec<String>) -> Vec<(String, String)> {
    let root = PathBuf::from(&root);
    let known: std::collections::HashSet<&str> = files.iter().map(String::as_str).collect();
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for from in files.iter().take(MAX_LINKED_DOCS) {
        let path = root.join(from);
        // A document big enough to be a data file is not one someone links notes
        // through; skip it rather than read megabytes to find no links.
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_DOC_BYTES) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let dir = Path::new(from).parent().unwrap_or(Path::new(""));
        for target in doc_link_targets(&text) {
            // `dir/../a.md` → `a.md`, without touching the disk: the link is
            // relative to the document that makes it.
            let Some(to) = normalize_rel(&dir.join(target)) else {
                continue;
            };
            if to == *from || !known.contains(to.as_str()) {
                continue;
            }
            if seen.insert((from.clone(), to.clone())) {
                out.push((from.clone(), to));
            }
        }
    }
    out
}

/// Documents read per call, and the size past which one is skipped — the graph
/// is drawn while the user waits, and a generated changelog or a data dump is
/// not what anyone links their notes through.
const MAX_LINKED_DOCS: usize = 2000;
const MAX_DOC_BYTES: u64 = 512 * 1024;

/// The markdown-link targets in `text` that point at another markdown file.
fn doc_link_targets(text: &str) -> Vec<&str> {
    static LINK: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = LINK.get_or_init(|| {
        // `[text](target)` and `[label]: target` alike; the target runs to the
        // first `)`, whitespace, `#` or quote, so anchors and titles fall away.
        regex::Regex::new(r#"(?m)(?:\]\(|^\[[^\]]*\]:\s*)<?([^)>\s#"']+)"#).unwrap()
    });
    re.captures_iter(text)
        .filter_map(|c| c.get(1))
        .map(|m| m.as_str())
        .filter(|t| {
            !t.contains("://")
                && !t.starts_with("mailto:")
                && t.rsplit('.').next().is_some_and(|e| {
                    ["md", "markdown", "mdx"]
                        .iter()
                        .any(|k| e.eq_ignore_ascii_case(k))
                })
        })
        .collect()
}

/// Collapse `.`/`..` in a project-relative path, without touching the disk and
/// without ever escaping the project (`../..` from the root yields None).
fn normalize_rel(p: &Path) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for c in p.components() {
        match c {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                parts.pop()?;
            }
            std::path::Component::Normal(s) => parts.push(s.to_str()?),
            // An absolute link is not a project-relative document.
            _ => return None,
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

#[tauri::command]
pub fn resolve_path(root: String, spec: String, search: Option<bool>) -> Result<Option<String>> {
    let root = PathBuf::from(&root);
    let p = PathBuf::from(&spec);
    let absolute = p.is_absolute();
    let cand = if absolute { p } else { root.join(&spec) };
    if cand.is_file() {
        if let Ok(abs) = ensure_within(&root, &cand) {
            return Ok(Some(abs.to_string_lossy().into_owned()));
        }
    }
    if search != Some(true) || absolute {
        return Ok(None);
    }
    Ok(find_by_suffix(&root, &spec).map(|p| p.to_string_lossy().into_owned()))
}

/// Shallowest indexed file whose relative path ends on `spec`'s segments, so
/// `Terminal.tsx` finds `src/components/organisms/Terminal.tsx` and a duplicate
/// buried in a vendor directory never wins over the real one.
fn find_by_suffix(root: &Path, spec: &str) -> Option<PathBuf> {
    let needle = spec.replace('\\', "/");
    let needle = needle.trim_start_matches("./").trim_start_matches('/');
    if needle.is_empty() {
        return None;
    }
    let tail = format!("/{needle}");
    let mut best: Option<PathBuf> = None;
    for entry in WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .build()
        .filter_map(|r| r.ok())
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .take(MAX_INDEXED_FILES)
    {
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        if rel != needle && !rel.ends_with(&tail) {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|b| b.as_os_str().len() > path.as_os_str().len())
        {
            best = Some(path.to_path_buf());
        }
    }
    best
}

/// Save the image on the clipboard to a PNG in the system temp directory and
/// return its path (`None` when the clipboard holds no image).
///
/// A PTY carries text, so the only way to hand a pasted screenshot to an agent
/// running in the terminal is to spill it to a file and paste that path. Temp,
/// not the project: these are throwaway, and the repo is not a scratch folder.
#[tauri::command(async)]
pub fn clipboard_image_to_temp(app: tauri::AppHandle) -> Result<Option<String>> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    // `read_image` must not run on the main thread (it can deadlock on Linux);
    // `command(async)` puts it on a worker.
    let Ok(img) = app.clipboard().read_image() else {
        return Ok(None);
    };
    let buf = image::RgbaImage::from_raw(img.width(), img.height(), img.rgba().to_vec())
        .ok_or_else(|| Error::Other("clipboard image has an unexpected size".into()))?;
    let dir = std::env::temp_dir().join("reado-clipboard");
    std::fs::create_dir_all(&dir)?;
    let name = chrono::Local::now()
        .format("clip-%Y%m%d-%H%M%S%.3f.png")
        .to_string();
    let path = dir.join(name);
    buf.save(&path).map_err(|e| Error::Other(e.to_string()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Let the webview load images from inside the open project through Tauri's
/// `asset:` protocol.
///
/// Markdown previews need this: a README's `![](docs/media/demo.gif)` is a path
/// on disk, and the webview would otherwise resolve it against its own origin
/// and 404. The frontend rewrites such `src`s with `convertFileSrc`, which only
/// works once the directory is in the asset scope — and the scope is empty by
/// default, so the grant has to happen per project, at runtime.
///
/// Scope is widened to the project root only, so this exposes exactly what the
/// user already opened — never the rest of the filesystem.
#[tauri::command]
pub fn allow_project_assets(app: tauri::AppHandle, root: String) -> Result<()> {
    use tauri::Manager;
    let scope = app.asset_protocol_scope();
    let raw = PathBuf::from(&root);
    // Grant the path as given *and* its canonical form: the frontend builds
    // image URLs from the path the user opened, which on a symlinked root
    // (`/tmp` -> `/private/tmp` on macOS) is not the resolved one — granting
    // only the latter would reject every request.
    let canonical = std::fs::canonicalize(&raw).ok();
    for dir in std::iter::once(&raw).chain(canonical.iter()) {
        scope
            .allow_directory(dir, true)
            .map_err(|e| Error::Other(e.to_string()))?;
    }
    Ok(())
}

/// Largest settings bundle Reado will read back (a bundle is a few KB).
const MAX_BUNDLE_BYTES: u64 = 1_048_576;

/// Reject a document path that isn't one of the two JSON documents Reado hands
/// to the OS dialogs: a settings bundle (`.json`) or a workspace file
/// (`.reado-workspace`).
///
/// These two commands are the only ones that touch a path outside the open
/// project, so they are kept as narrow as the feature allows: the path comes
/// from the OS save/open dialog (which the webview cannot show without the user
/// acting), its extension must be one of those two, and reads are size-capped.
/// That is the whole of the widening — there is deliberately no general
/// read/write-any-file command for the frontend to reach for.
fn check_bundle_path(path: &str) -> Result<PathBuf> {
    let p = PathBuf::from(path);
    let ext = p.extension().and_then(|e| e.to_str());
    if ext != Some("json") && ext != Some("reado-workspace") {
        return Err(Error::Other(
            "that path is neither a .json settings file nor a .reado-workspace".into(),
        ));
    }
    Ok(p)
}

/// Write a settings bundle to a path the user picked in the save dialog.
#[tauri::command]
pub fn write_settings_file(path: String, json: String) -> Result<()> {
    std::fs::write(check_bundle_path(&path)?, json)?;
    Ok(())
}

/// Read a settings bundle from a path the user picked in the open dialog.
#[tauri::command]
pub fn read_settings_file(path: String) -> Result<String> {
    let p = check_bundle_path(&path)?;
    if std::fs::metadata(&p)?.len() > MAX_BUNDLE_BYTES {
        return Err(Error::Other(
            "that file is too large to be a settings bundle".into(),
        ));
    }
    Ok(std::fs::read_to_string(p)?)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        base64_encode, create_dir, create_file, doc_links, list_dir, normalize_rel, Charset,
        FileContent, MAX_TEXT_BYTES,
    };

    #[test]
    fn the_history_key_is_relative_and_skips_reados_own_files() {
        // Callers pass both shapes; keying off the caller's string gave one
        // history directory per absolute path.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.ts"), "x").unwrap();
        std::fs::create_dir_all(root.join(".reado")).unwrap();
        std::fs::write(root.join(".reado/config.json"), "{}").unwrap();

        assert_eq!(
            super::history_key(root, &root.join("src/a.ts")).as_deref(),
            Some("src/a.ts")
        );
        // `.reado/` is scratch and config — no history of the history.
        assert_eq!(
            super::history_key(root, &root.join(".reado/config.json")),
            None
        );
    }

    #[test]
    fn an_escaping_create_leaves_no_directories_outside_the_project() {
        // The refusal alone isn't the property: `create_dir_all` runs before
        // the final confinement check, so without the ancestor guard the
        // directories are made outside the project and only the *file* is
        // refused.
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path().join("proj");
        std::fs::create_dir(&root).unwrap();

        let out = create_file(
            root.to_string_lossy().into_owned(),
            "../escaped/nested/x.txt".into(),
        );
        assert!(out.is_err());
        assert!(!proj.path().join("escaped").exists());
    }

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
    fn resolves_a_parent_relative_import() {
        // `../` is at least as common as `./` and had no coverage at all.
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        std::fs::create_dir_all(root.join("src/a")).unwrap();
        std::fs::write(root.join("src/c.ts"), "").unwrap();
        let out = super::resolve_import(
            root.to_string_lossy().into_owned(),
            root.join("src/a/b.ts").to_string_lossy().into_owned(),
            "../c".into(),
        )
        .unwrap();
        assert!(
            out.as_deref().is_some_and(|p| p.ends_with("src/c.ts")),
            "expected src/c.ts, got {out:?}"
        );
    }

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

    /// The editor saves by project-relative path while reading by absolute one,
    /// so both must land on the same file — and neither may be resolved against
    /// the process's working directory, which is wherever Reado was launched.
    #[test]
    fn writes_resolve_relative_and_absolute_paths_alike() {
        use std::fs;
        let proj = tempfile::TempDir::new().unwrap();
        let root = proj.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src/a.txt"), b"old").unwrap();

        super::write_file(s(root.into()), "src/a.txt".into(), "relative".into(), None).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("src/a.txt")).unwrap(),
            "relative"
        );

        super::write_file(
            s(root.into()),
            s(root.join("src/a.txt")),
            "absolute".into(),
            None,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("src/a.txt")).unwrap(),
            "absolute"
        );

        // Confinement still holds for a relative path that climbs out.
        let outside = tempfile::TempDir::new().unwrap();
        fs::write(outside.path().join("o.txt"), b"keep").unwrap();
        let escape = format!(
            "../{}/o.txt",
            outside.path().file_name().unwrap().to_string_lossy()
        );
        assert!(super::write_file(s(root.into()), escape, "pwned".into(), None).is_err());
        assert_eq!(
            fs::read_to_string(outside.path().join("o.txt")).unwrap(),
            "keep"
        );
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

    #[test]
    fn read_file_classifies_text_binary_and_image() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();

        // Plain UTF-8 text → Text with the exact content.
        fs::write(root.join("hello.txt"), "hello world\n").unwrap();
        match super::read_file(s(root.into()), s(root.join("hello.txt")), None, None, None).unwrap()
        {
            FileContent::Text { text, .. } => assert_eq!(text, "hello world\n"),
            other => panic!("expected Text, got {other:?}"),
        }

        // A NUL byte in the first 8 KiB → Binary.
        fs::write(root.join("blob.dat"), b"abc\0def").unwrap();
        match super::read_file(s(root.into()), s(root.join("blob.dat")), None, None, None).unwrap()
        {
            FileContent::Binary { size } => assert_eq!(size, 7),
            other => panic!("expected Binary, got {other:?}"),
        }

        // Image extension → data URL (mime keyed off the extension, not the bytes).
        fs::write(root.join("pic.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        match super::read_file(s(root.into()), s(root.join("pic.png")), None, None, None).unwrap() {
            FileContent::Image { data_url } => {
                assert!(data_url.starts_with("data:image/png;base64,"));
            }
            other => panic!("expected Image, got {other:?}"),
        }

        // `as_text = Some(true)` decodes an image-renderable format as source text.
        match super::read_file(
            s(root.into()),
            s(root.join("pic.png")),
            Some(true),
            None,
            None,
        )
        .unwrap()
        {
            // The bytes aren't valid UTF-8, so it falls through to Binary — the
            // point is that the image data-URL branch was bypassed.
            FileContent::Binary { .. } => {}
            other => panic!("expected Binary (image branch skipped), got {other:?}"),
        }
    }

    #[test]
    fn read_file_rejects_oversized_by_size() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();

        // One byte over the eager-read cap → Binary { size } straight from metadata,
        // without decoding the whole file.
        let size = MAX_TEXT_BYTES + 1;
        fs::write(root.join("big.txt"), vec![b'a'; size as usize]).unwrap();
        match super::read_file(s(root.into()), s(root.join("big.txt")), None, None, None).unwrap() {
            FileContent::Binary { size: reported } => assert_eq!(reported, size),
            other => panic!("expected Binary by size, got {other:?}"),
        }
    }

    #[test]
    fn the_large_file_guard_reports_without_reading() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::write(root.join("bundle.js"), vec![b'a'; 4096]).unwrap();

        match super::read_file(
            s(root.into()),
            s(root.join("bundle.js")),
            None,
            Some(1024),
            None,
        )
        .unwrap()
        {
            FileContent::Large { size } => assert_eq!(size, 4096),
            other => panic!("expected Large, got {other:?}"),
        }
    }

    #[test]
    fn a_file_under_the_guard_is_read_normally() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::write(root.join("small.txt"), "hello").unwrap();

        match super::read_file(
            s(root.into()),
            s(root.join("small.txt")),
            None,
            Some(1024),
            None,
        )
        .unwrap()
        {
            FileContent::Text { text, .. } => assert_eq!(text, "hello"),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn a_zero_guard_opens_anything_the_hard_cap_allows() {
        // This is the "open anyway" bypass: the user asked for it explicitly.
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::write(root.join("bundle.js"), vec![b'a'; 4096]).unwrap();

        for guard in [None, Some(0)] {
            match super::read_file(s(root.into()), s(root.join("bundle.js")), None, guard, None)
                .unwrap()
            {
                FileContent::Text { text, .. } => assert_eq!(text.len(), 4096),
                other => panic!("expected Text with guard {guard:?}, got {other:?}"),
            }
        }
    }

    #[test]
    fn a_settings_bundle_must_be_a_json_file() {
        // These two commands are the only ones that touch a path outside the
        // open project, so the extension check is the whole of the guard.
        let dir = tempfile::tempdir().unwrap();
        let bad = dir.path().join("id_rsa");
        std::fs::write(&bad, "secret").unwrap();
        assert!(super::read_settings_file(bad.to_string_lossy().into_owned()).is_err());
        assert!(
            super::write_settings_file(bad.to_string_lossy().into_owned(), "{}".into()).is_err()
        );
        // …and the file it refused to write is untouched.
        assert_eq!(std::fs::read_to_string(&bad).unwrap(), "secret");
    }

    #[test]
    fn a_settings_bundle_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reado-settings.json");
        let p = path.to_string_lossy().into_owned();
        super::write_settings_file(p.clone(), "{\"a\":1}".into()).unwrap();
        assert_eq!(super::read_settings_file(p).unwrap(), "{\"a\":1}");
    }

    #[test]
    fn an_oversized_bundle_is_refused_rather_than_slurped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.json");
        std::fs::write(&path, vec![b'x'; (super::MAX_BUNDLE_BYTES + 1) as usize]).unwrap();
        assert!(super::read_settings_file(path.to_string_lossy().into_owned()).is_err());
    }

    #[test]
    fn a_latin1_file_opens_as_text_instead_of_binary() {
        // The bug this closes: a file Reado couldn't decode as UTF-8 was
        // reported as "binary" and had no way to be opened at all.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        std::fs::write(root.join("legacy.txt"), b"caff\xE8\n").unwrap();

        match super::read_file(s(root.into()), s(root.join("legacy.txt")), None, None, None)
            .unwrap()
        {
            FileContent::Text { text, encoding } => {
                assert_eq!(text, "caffè\n");
                assert_eq!(encoding, Charset::Other("windows-1252"));
            }
            other => panic!("expected decoded Text, got {other:?}"),
        }
    }

    #[test]
    fn an_explicit_encoding_overrides_detection() {
        // "Reopen with Encoding" is an instruction: the same bytes mean
        // different text in windows-1251 than in windows-1252, and only the
        // reader knows which.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        std::fs::write(root.join("legacy.txt"), b"\xE8").unwrap();

        let forced = super::read_file(
            s(root.into()),
            s(root.join("legacy.txt")),
            None,
            None,
            Some("windows-1251".into()),
        )
        .unwrap();
        match forced {
            FileContent::Text { text, encoding } => {
                assert_eq!(text, "и");
                assert_eq!(encoding, Charset::Other("windows-1251"));
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn a_utf16_file_is_not_mistaken_for_binary() {
        // Every ASCII character in UTF-16 carries a NUL padding byte, which is
        // exactly the signal the binary check looks for.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        let bytes = crate::encoding::encode("hello\n", Charset::Utf16Le).unwrap();
        std::fs::write(root.join("wide.txt"), bytes).unwrap();

        match super::read_file(s(root.into()), s(root.join("wide.txt")), None, None, None).unwrap()
        {
            FileContent::Text { text, encoding } => {
                assert_eq!(text, "hello\n");
                assert_eq!(encoding, Charset::Utf16Le);
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn a_file_is_written_back_in_the_encoding_it_was_read_as() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        std::fs::write(root.join("legacy.txt"), b"old").unwrap();
        super::write_file(
            s(root.into()),
            "legacy.txt".into(),
            "caffè\n".into(),
            Some("windows-1252".into()),
        )
        .unwrap();
        assert_eq!(
            std::fs::read(root.join("legacy.txt")).unwrap(),
            b"caff\xE8\n"
        );
    }

    #[test]
    fn a_save_is_refused_rather_than_writing_question_marks() {
        // Substituting "?" for a character the encoding can't hold is data loss
        // dressed up as a successful save.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        std::fs::write(root.join("legacy.txt"), b"old").unwrap();
        assert!(super::write_file(
            s(root.into()),
            "legacy.txt".into(),
            "coffee ☕".into(),
            Some("windows-1252".into()),
        )
        .is_err());
        // And the file it refused to write is untouched.
        assert_eq!(std::fs::read(root.join("legacy.txt")).unwrap(), b"old");
    }

    #[test]
    fn the_hard_cap_still_wins_over_a_looser_guard() {
        // A guard above MAX_TEXT_BYTES must not talk the reader into slurping a
        // multi-gigabyte file into memory.
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        let size = MAX_TEXT_BYTES + 1;
        fs::write(root.join("huge.txt"), vec![b'a'; size as usize]).unwrap();

        match super::read_file(
            s(root.into()),
            s(root.join("huge.txt")),
            None,
            Some(MAX_TEXT_BYTES * 4),
            None,
        )
        .unwrap()
        {
            FileContent::Binary { size: reported } => assert_eq!(reported, size),
            other => panic!("expected Binary by hard cap, got {other:?}"),
        }
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

    /// A bare filename printed by an agent (`Terminal.tsx:104`) is not a
    /// root-relative path — without the suffix search the click resolves to
    /// nothing, which is what made terminal links look broken.
    #[test]
    fn doc_links_are_the_links_the_documents_actually_make() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("docs/deep")).unwrap();
        fs::write(
            root.join("README.md"),
            "see [guide](docs/guide.md) and [ext](https://x.dev/a.md)\n\
             [ref]: docs/deep/notes.md\n\
             [code](src/main.rs) [missing](docs/nope.md) [anchor](docs/guide.md#part)\n",
        )
        .unwrap();
        fs::write(root.join("docs/guide.md"), "back to [home](../README.md)\n").unwrap();
        fs::write(
            root.join("docs/deep/notes.md"),
            "up to [guide](../guide.md)\n",
        )
        .unwrap();
        let files: Vec<String> = ["README.md", "docs/guide.md", "docs/deep/notes.md"]
            .iter()
            .map(|s| (*s).to_string())
            .collect();

        let mut got = doc_links(root.to_string_lossy().into_owned(), files);
        got.sort();
        assert_eq!(
            got,
            vec![
                ("README.md".into(), "docs/deep/notes.md".into()),
                ("README.md".into(), "docs/guide.md".into()),
                ("docs/deep/notes.md".into(), "docs/guide.md".into()),
                ("docs/guide.md".into(), "README.md".into()),
            ],
            "URLs, code, missing targets and duplicate anchors are all dropped"
        );
    }

    #[test]
    fn a_link_cannot_escape_the_project() {
        assert_eq!(
            normalize_rel(Path::new("docs/../a.md")).as_deref(),
            Some("a.md")
        );
        assert_eq!(normalize_rel(Path::new("docs/../../secrets.md")), None);
        assert_eq!(normalize_rel(Path::new("/etc/passwd.md")), None);
    }

    #[test]
    fn resolve_path_finds_files_by_suffix() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        fs::create_dir_all(root.join("src/components")).unwrap();
        fs::create_dir_all(root.join("vendor/dup/src/components")).unwrap();
        fs::write(root.join("src/components/Terminal.tsx"), "").unwrap();
        fs::write(root.join("vendor/dup/src/components/Terminal.tsx"), "").unwrap();

        // Off by default: an existing caller probing for a root-level file
        // (`angular.json`) must not start matching one nested in a subfolder.
        assert_eq!(
            super::resolve_path(s(root.into()), "Terminal.tsx".into(), None).unwrap(),
            None
        );
        // On, the shallowest match wins over the vendored duplicate.
        assert_eq!(
            super::resolve_path(s(root.into()), "Terminal.tsx".into(), Some(true)).unwrap(),
            Some(s(root.join("src/components/Terminal.tsx")))
        );
        // A partial path still anchors on segment boundaries…
        assert_eq!(
            super::resolve_path(s(root.into()), "components/Terminal.tsx".into(), Some(true))
                .unwrap(),
            Some(s(root.join("src/components/Terminal.tsx")))
        );
        // …so a suffix that isn't a whole segment doesn't match.
        assert_eq!(
            super::resolve_path(s(root.into()), "inal.tsx".into(), Some(true)).unwrap(),
            None
        );
    }
}
