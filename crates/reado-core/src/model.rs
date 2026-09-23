//! The domain types: a comment, its anchor, its thread, and the inputs that
//! create and edit one.

use serde::{Deserialize, Serialize};

use crate::store::new_id;

/// Fixed comment type. The set is intentionally closed.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommentType {
    Bug,
    Refactor,
    Performance,
    Question,
    Note,
}

/// Lifecycle state. `orphan` is a separate flag, not a state.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CommentState {
    Open,
    InProgress,
    Done,
    Discarded,
    /// The agent tried and cannot proceed without a human. Distinct from `Open`
    /// because an open task is one nobody has picked up yet, while a blocked one
    /// has been picked up, attempted, and handed back with a reason — sending it
    /// round the loop again would just burn the same attempt.
    Blocked,
    /// The agent says it fixed this, and nothing checked. Distinct from `Done`
    /// because "an agent claims it works" and "a command proved it works" are
    /// different facts, and collapsing them means the reviewer can't tell which
    /// resolutions still need a human to look.
    ResolvedUnverified,
}

/// What a verification command reported.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    /// The command as run, so the reviewer can run it themselves.
    pub cmd: String,
    pub passed: bool,
}

/// How a task was resolved: who did it, with what, against which diff, and
/// whether anything checked.
///
/// The point is provenance. "Done" on its own asks the reviewer to trust that
/// some agent, at some point, with some model, changed something correct. This
/// records which agent, which model, which diff, and what the verification
/// command said — so reviewing a resolution is reading evidence, not taking a
/// claim on faith.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    /// The agent id (`$READO_AGENT`), e.g. "claude-code".
    pub agent: String,
    /// The model, when the agent reports one (`$READO_MODEL` or `--model`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// A git ref or range naming the change that resolved this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify: Option<Verification>,
    pub at: u64,
}

/// Whether a comment is an actionable task (eligible for the AI review batch)
/// or a passive note (excluded from the batch).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommentKind {
    Task,
    Note,
}

/// What a comment is anchored to.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Range,
    File,
    Project,
    /// A design comment anchored to a point on a live browser page (url + x/y),
    /// not to code. `file`/line fields are unused; see `Anchor::url`/`x`/`y`.
    Web,
}

/// Where a comment lives in the code (an external overlay — never in the file).
///
/// Serialised in camelCase to match the TypeScript `Anchor`. The `alias`es keep
/// reading `.md` files written before this struct adopted camelCase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    /// Project-relative path with forward slashes (empty for project scope).
    pub file: String,
    pub scope: Scope,
    /// 1-based inclusive line range (ignored for file/project scope).
    #[serde(default, alias = "start_line")]
    pub start_line: u32,
    #[serde(default, alias = "end_line")]
    pub end_line: u32,
    /// For `Scope::Web`: the page URL and the click point in document
    /// coordinates. Absent (and skipped in the `.md`) for code anchors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    /// For `Scope::Web`: the element under the click, so the pin can follow it
    /// when the page scrolls, reflows or resizes. `x`/`y` stay as the fallback
    /// for a page whose element is gone, and for comments made before this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<WebTarget>,
}

impl Anchor {
    /// A code anchor: a file and line range, with none of the web-page fields.
    pub fn code(file: impl Into<String>, scope: Scope, start_line: u32, end_line: u32) -> Self {
        Anchor {
            file: file.into(),
            scope,
            start_line,
            end_line,
            url: None,
            x: None,
            y: None,
            target: None,
        }
    }
}

/// Where on a web page a design comment was left: an element, found again by
/// its index path from `<html>` (each step a child index), and the click's offset
/// from that element's top-left corner in CSS pixels.
///
/// The rest describes the element for whoever resolves the comment — an agent
/// gets from these what a code comment's `file:line` tells it: a CSS selector,
/// its visible text, the start of its HTML, and the component that rendered it
/// (with its source file) when the page is a dev build of an app that says.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebTarget {
    pub path: Vec<u32>,
    pub dx: f64,
    pub dy: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
}

/// Adaptive snapshot of the anchored code, used to re-locate the anchor after
/// external edits.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Context {
    #[serde(default)]
    pub snippet: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub after: String,
}

/// YAML front-matter persisted at the top of each comment `.md`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub comment_type: CommentType,
    pub state: CommentState,
    pub kind: CommentKind,
    pub anchor: Anchor,
    #[serde(default)]
    pub context: Context,
    #[serde(default)]
    pub links: Vec<String>,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// The hosting forge a pulled review thread came from ("github"/"gitlab"),
    /// or `None` for a native Reado comment. Drives the inbox origin badge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    /// The host thread/discussion id, for resolution sync back to the forge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    /// The host change-request ref (PR/MR number) the thread belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_ref: Option<String>,
    #[serde(default)]
    pub orphan: bool,
    /// Why the agent could not proceed, set with the `Blocked` state. Kept beside
    /// the state rather than only as a reply so the UI can show it without
    /// reading the thread.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
    /// How many times an agent has tried and failed this task. Past
    /// `ATTEMPT_BUDGET` the task blocks itself: the loop has evidence that
    /// retrying is not working.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub attempts: u32,
    /// How this task was resolved, when it was. Additive: a task resolved before
    /// this existed simply has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<Resolution>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl CommentMeta {
    /// A fresh `Open` comment with a new id, created and updated at `now`; every
    /// other field (context, links, forge origin, attempts, …) at its default.
    pub fn new(
        comment_type: CommentType,
        kind: CommentKind,
        anchor: Anchor,
        author: &str,
        agent: Option<String>,
        now: u64,
    ) -> Self {
        CommentMeta {
            id: new_id(),
            comment_type,
            state: CommentState::Open,
            kind,
            anchor,
            context: Context::default(),
            links: Vec::new(),
            author: author.to_string(),
            agent,
            origin: None,
            external_id: None,
            external_ref: None,
            orphan: false,
            blocked_reason: None,
            attempts: 0,
            resolution: None,
            created_at: now,
            updated_at: now,
        }
    }
}

fn is_zero(n: &u32) -> bool {
    *n == 0
}

/// Failed attempts before a task blocks itself. Three is enough to ride out a
/// flaky run and few enough that a genuinely stuck task stops early.
pub const ATTEMPT_BUDGET: u32 = 3;

/// One message in a comment thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub created_at: u64,
    pub body: String,
}

/// A full comment: metadata plus the parsed thread.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    #[serde(flatten)]
    pub meta: CommentMeta,
    pub messages: Vec<Message>,
    /// `true` when read from `archive/` rather than `comments/`.
    pub archived: bool,
}

/// Input for creating a comment.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewComment {
    pub file: String,
    pub scope: Scope,
    #[serde(default)]
    pub start_line: u32,
    #[serde(default)]
    pub end_line: u32,
    #[serde(rename = "type")]
    pub comment_type: CommentType,
    pub kind: CommentKind,
    pub body: String,
    #[serde(default)]
    pub context: Context,
    /// For `Scope::Web`: page URL and click point (document coordinates).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    /// For `Scope::Web`: the element under the click, so the pin can follow it
    /// when the page scrolls, reflows or resizes. `x`/`y` stay as the fallback
    /// for a page whose element is gone, and for comments made before this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<WebTarget>,
}

/// Result of creating a comment.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub comment: Comment,
    pub first_comment: bool,
}

/// Editable metadata fields. Any `None` field is left unchanged.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentPatch {
    #[serde(rename = "type")]
    pub comment_type: Option<CommentType>,
    pub kind: Option<CommentKind>,
    pub links: Option<Vec<String>>,
    pub body: Option<String>,
}
