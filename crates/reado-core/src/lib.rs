//! Reado's annotation store — the shared comment model and on-disk format.
//!
//! Comments are durable, human- and AI-readable artifacts. Each is a single
//! `.md` file with YAML front-matter (metadata + anchor) and a Markdown body
//! holding the conversation thread; the `.md` files are the **source of truth**.
//!
//! This crate is shared by the Reado desktop app (Tauri command wrappers) and
//! the `reado` CLI (the stable contract the AI agent uses), so the on-disk
//! format and all mutation logic live in exactly one place.
//!
//! ## Layout (under the project root)
//! ```text
//! .reado/
//!   comments/   active comments (one <id>.md each)
//!   archive/    resolved comments, kept as consultable history
//! ```
//!
//! ## Thread encoding
//! The body starts with the root message; each reply is introduced by an HTML
//! comment marker so the file stays valid, readable Markdown yet machine-parseable:
//! ```text
//! The root comment.
//!
//! <!-- reado:reply author=agent agent=claude-code at=1718900000000 -->
//!
//! The agent's reply.
//! ```

mod anchor;
mod error;
mod format;
mod handoff;
mod model;
mod project;
mod session;
mod store;

pub use anchor::*;
pub use error::*;
pub use handoff::*;
pub use model::*;
pub use project::*;
pub use session::*;
pub use store::*;
