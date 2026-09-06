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

    #[error(transparent)]
    Store(#[from] reado_core::Error),

    // Catch-all for command-specific failures. Serialises verbatim, so a
    // command with its own wording keeps it.
    #[error("{0}")]
    Other(String),
}

impl Error {
    /// Wrap anything printable as a command failure, keeping its own words.
    pub fn other(e: impl std::fmt::Display) -> Self {
        Error::Other(e.to_string())
    }
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
