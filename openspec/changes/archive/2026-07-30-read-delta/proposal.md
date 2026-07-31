## Why

Reado already flips a previously-read file back to **unread** when it changes
externally (e.g. the AI agent edits it) — see the `file-changed` handler in
`src/components/pages/ProjectView.tsx`. But "unread" is a blunt signal: it tells
you *that* something changed, not *what*. In the comment↔AI loop the user reads a
file, dispatches comments, the agent edits, and then has to re-read the whole
file to find the handful of lines that actually moved.

This change captures a content snapshot at the moment a file is marked read, so
that when it later changes the user can review **only the delta** — a diff
between the last-read snapshot and the current content — instead of re-reading
everything. It is the natural close of the read → comment → agent-edits → review
loop, and it's read-first: less to re-read, the change is the hero.

## What Changes

- Snapshot the file's content (and a hash) into `.reado/` whenever a file is
  marked **read**, and drop the snapshot when it's marked unread.
  - Rust: extend `src-tauri/src/progress.rs` (the `set_read` command and store)
    to persist a per-file last-read snapshot/hash alongside `.reado/read.json`.
  - Frontend: extend `src/lib/api.ts` and `src/lib/readProgress.ts` so marking
    read passes the current buffer text to the backend for snapshotting.
- Compute the **delta** between the last-read snapshot and current content and
  render it as a diff. Reuse the unified-merge pattern in
  `src/components/organisms/DiffView.tsx` (the existing HEAD diff) but with the
  last-read snapshot as the base instead of git HEAD.
- A **"review changes"** affordance surfaced from a file's unread state (it
  became unread because it changed since you read it) — in the file tree row and
  in the editor — that opens the delta view for that file.
- After reviewing, the user can **clear back to read**, which re-snapshots the
  current content as the new last-read baseline and removes the unread/changed
  marker.

## Capabilities

### Added Capabilities
- `read-delta`: snapshot last-read content when marking read, then let the user
  review only the diff between the last-read snapshot and current content when a
  read file changes, and clear back to read after review.

## Out of Scope

- Replacing the existing git-HEAD `DiffView`; the delta view is a distinct,
  snapshot-based base.
- Auto-marking on scroll, tree/folder progress indicators (owned by
  `reading-progress`).
- Three-way/semantic diffs, per-hunk accept, or editing from the delta view; the
  delta view is read-only review.
- Snapshotting binary/very-large files beyond a sane size guard.
