use std::path::{Path, PathBuf};

use super::{
    base64_encode, ensure_ancestor_within, ensure_dest_within, ensure_within, FileContent,
};
use crate::encoding::Charset;
use crate::error::{Error, Result};

/// Largest text file we load eagerly (8 MiB). Larger files are still read; the
/// cap exists only to avoid pulling, say, a 1 GiB log fully into the webview.
const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;

/// Largest image or PDF handed back as a data URL. Checked by metadata *before*
/// reading, so a giant image (e.g. a multi-GB .svg/.bmp) or PDF isn't slurped
/// whole and base64-expanded into memory.
const MAX_MEDIA_BYTES: u64 = 64 * 1024 * 1024;

/// The MIME type of a file the frontend renders from its bytes rather than as
/// text: images (a `data:` URL ready for `<img src>`) and PDFs (rendered in the
/// in-app pdf.js viewer, handed back as a data URL like images).
fn media_mime(path: &Path) -> Option<&'static str> {
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
        Some("pdf") => Some("application/pdf"),
        _ => None,
    }
}

/// An image or PDF as a `data:` URL — or `Binary` past [`MAX_MEDIA_BYTES`].
fn data_url(path: &Path, meta: &std::fs::Metadata, mime: &'static str) -> Result<FileContent> {
    if meta.len() > MAX_MEDIA_BYTES {
        return Ok(FileContent::Binary { size: meta.len() });
    }
    let encoded = base64_encode(&std::fs::read(path)?);
    let data_url = format!("data:{mime};base64,{encoded}");
    Ok(if mime == "application/pdf" {
        FileContent::Pdf { data_url }
    } else {
        FileContent::Image { data_url }
    })
}

/// Decide what a file's bytes are: text in some encoding, or binary. `forced` is
/// the user's explicit encoding, used instead of detection.
fn classify(bytes: &[u8], forced: Option<Charset>) -> FileContent {
    let size = bytes.len() as u64;
    let Some(charset) = forced.or_else(|| Charset::detect_default(bytes)) else {
        // Not text in any encoding we would guess at.
        return FileContent::Binary { size };
    };

    // A NUL byte in the first 8 KiB is a reliable "this is binary" signal — but
    // not for UTF-16, where every ASCII character carries a NUL padding byte.
    // Reading those as binary is one of the bugs this whole path fixes.
    let utf16 = matches!(charset, Charset::Utf16Le | Charset::Utf16Be);
    if !utf16 && bytes[..bytes.len().min(8192)].contains(&0) {
        return FileContent::Binary { size };
    }

    match crate::encoding::decode(bytes, charset) {
        Some(text) => FileContent::Text {
            text,
            encoding: charset,
        },
        None => FileContent::Binary { size },
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
        if let Some(mime) = media_mime(&path) {
            return data_url(&path, &metadata, mime);
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
    Ok(classify(&bytes, forced))
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
    use super::*;

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
    fn classify_tells_text_from_binary_without_touching_the_disk() {
        match classify(b"fn main() {}\n", None) {
            FileContent::Text { text, encoding } => {
                assert_eq!(text, "fn main() {}\n");
                assert_eq!(encoding, Charset::Utf8);
            }
            other => panic!("expected Text, got {other:?}"),
        }
        // A NUL early on is binary, sized by the bytes it was given.
        assert!(matches!(
            classify(b"ab\0cd", None),
            FileContent::Binary { size: 5 }
        ));
        // …but not in UTF-16, where every ASCII char carries one.
        let wide = crate::encoding::encode("hi", Charset::Utf16Le).unwrap();
        assert!(matches!(
            classify(&wide, None),
            FileContent::Text {
                encoding: Charset::Utf16Le,
                ..
            }
        ));
        // A forced encoding skips detection.
        match classify(b"\xE8", Some(Charset::from_label("windows-1251"))) {
            FileContent::Text { text, .. } => assert_eq!(text, "и"),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn a_pdf_comes_back_as_a_pdf_data_url() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        std::fs::write(root.join("doc.PDF"), b"%PDF-1.4").unwrap();
        match read_file(s(root.into()), s(root.join("doc.PDF")), None, None, None).unwrap() {
            FileContent::Pdf { data_url } => {
                assert!(data_url.starts_with("data:application/pdf;base64,"))
            }
            other => panic!("expected Pdf, got {other:?}"),
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
            None,
        )
        .unwrap()
        {
            FileContent::Binary { size: reported } => assert_eq!(reported, size),
            other => panic!("expected Binary by hard cap, got {other:?}"),
        }
    }
}
