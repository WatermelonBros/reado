//! Error type shared by every Tauri command.
//!
//! Commands return [`Result<T, Error>`]; the error serialises to a plain string
//! on the JavaScript side, so the frontend always receives a human-readable
//! message rather than an opaque object.

use serde::{Serialize, Serializer};

/// Errors that can cross the Tauri command boundary.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("path is outside the project root")]
    PathEscapesRoot,

    #[error("ripgrep is not available on PATH")]
    RipgrepMissing,

    #[error(transparent)]
    Store(#[from] reado_core::Error),

    // Catch-all for command-specific failures.
    #[allow(dead_code)]
    #[error("{0}")]
    Other(String),
}

/// Serialise as the error message string so `invoke` rejects with readable text.
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
