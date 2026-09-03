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
    let mut b = ignore::overrides::OverrideBuilder::new(root);
    let mut any = false;
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
#[tauri::command]
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
    /// UTF-8 text (code, markdown, JSON, …).
    Text { text: String },
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

/// Write UTF-8 text back to a file (optional manual editing). The path is
/// confined to the project root.
#[tauri::command]
pub fn write_file(root: String, path: String, content: String) -> Result<()> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    let bytes = content.len();
    std::fs::write(&path, content).inspect_err(|e| {
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
    // Confine *before* creating any directories: canonicalize the nearest
    // existing ancestor of the target and reject anything that resolves outside
    // root, so a `..`-escaping path can't leave directories behind outside the
    // project as a side effect of the create_dir_all below.
    let canon_root = root.canonicalize()?;
    let anchor = target
        .ancestors()
        .find(|p| p.exists())
        .ok_or(Error::PathEscapesRoot)?;
    if !anchor.canonicalize()?.starts_with(&canon_root) {
        return Err(Error::PathEscapesRoot);
    }
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
) -> Result<FileContent> {
    let root = PathBuf::from(&root);
    let path = ensure_within(&root, &PathBuf::from(&path))?;
    let metadata = std::fs::metadata(&path)?;

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
    // A NUL byte in the first 8 KiB is a reliable "this is binary" signal.
    let probe = &bytes[..bytes.len().min(8192)];
    let looks_binary = probe.contains(&0);

    if looks_binary {
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
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
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

#[cfg(test)]
mod tests {
    use super::{base64_encode, create_file, list_dir, FileContent, MAX_TEXT_BYTES};

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
        assert!(entries[0].is_dir, "expected z_dir first, got {:?}", entries[0]);
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

        super::write_file(s(root.into()), "src/a.txt".into(), "relative".into()).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("src/a.txt")).unwrap(),
            "relative"
        );

        super::write_file(s(root.into()), s(root.join("src/a.txt")), "absolute".into()).unwrap();
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
        assert!(super::write_file(s(root.into()), escape, "pwned".into()).is_err());
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
        match super::read_file(s(root.into()), s(root.join("hello.txt")), None, None).unwrap() {
            FileContent::Text { text } => assert_eq!(text, "hello world\n"),
            other => panic!("expected Text, got {other:?}"),
        }

        // A NUL byte in the first 8 KiB → Binary.
        fs::write(root.join("blob.dat"), b"abc\0def").unwrap();
        match super::read_file(s(root.into()), s(root.join("blob.dat")), None, None).unwrap() {
            FileContent::Binary { size } => assert_eq!(size, 7),
            other => panic!("expected Binary, got {other:?}"),
        }

        // Image extension → data URL (mime keyed off the extension, not the bytes).
        fs::write(root.join("pic.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        match super::read_file(s(root.into()), s(root.join("pic.png")), None, None).unwrap() {
            FileContent::Image { data_url } => {
                assert!(data_url.starts_with("data:image/png;base64,"));
            }
            other => panic!("expected Image, got {other:?}"),
        }

        // `as_text = Some(true)` decodes an image-renderable format as source text.
        match super::read_file(s(root.into()), s(root.join("pic.png")), Some(true), None).unwrap() {
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
        match super::read_file(s(root.into()), s(root.join("big.txt")), None, None).unwrap() {
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

        match super::read_file(s(root.into()), s(root.join("bundle.js")), None, Some(1024)).unwrap()
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

        match super::read_file(s(root.into()), s(root.join("small.txt")), None, Some(1024)).unwrap()
        {
            FileContent::Text { text } => assert_eq!(text, "hello"),
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
            match super::read_file(s(root.into()), s(root.join("bundle.js")), None, guard).unwrap()
            {
                FileContent::Text { text } => assert_eq!(text.len(), 4096),
                other => panic!("expected Text with guard {guard:?}, got {other:?}"),
            }
        }
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
