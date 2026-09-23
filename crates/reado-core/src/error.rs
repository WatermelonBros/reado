//! Errors from store operations.

/// Errors from store operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("YAML error: {0}")]
    Yaml(String),
    #[error("JSON error: {0}")]
    Json(String),
    #[error("no such comment: {0}")]
    NotFound(String),
    /// A well-formed call refused on purpose — the message names what to do
    /// instead, because its reader is an agent deciding its next move.
    #[error("{0}")]
    Rejected(String),
}

pub type Result<T> = std::result::Result<T, Error>;
