//! Filesystem commands: gitignore-aware directory listing and file reading.
//!
//! Directory listing reuses ripgrep's [`ignore`] crate so the file tree honours
//! exactly the same ignore rules (`.gitignore`, `.ignore`, global excludes) that
//! Reado's full-text search does. Listing is lazy — one directory level at a
//! time — so even very large repositories open instantly.

mod io;
mod list;
mod ops;
mod resolve;

pub use io::*;
pub use list::*;
pub use ops::*;
pub use resolve::*;

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Error, Result};

/// Nanoseconds since the epoch, or 0 if the clock is before it.
pub(crate) fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos())
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

#[cfg(test)]
mod tests {
    use super::*;

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
