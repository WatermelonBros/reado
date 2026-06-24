## Why

Reado's loop is "the comment is the unit": you annotate, then dispatch open
comments to a terminal AI agent (Claude Code/Codex) that edits files and commits.
But once "Send Review" fires, the agent's work is opaque — the only honest signal
is the raw terminal scrollback, which the user must scan to learn which files
changed and whether their comments were addressed. That contradicts the brand
promise to never hide state.

This change adds an **honest, read-only Agent Activity panel**: as the agent
touches files (observed through the existing file watcher), Reado surfaces a
live, rolling list of changes and links each one back to the comment(s) it
likely resolves. The user sees, at a glance and without leaving the editor, what
the agent is doing and what it changed — a calm surface that reports state but
never drives the agent.

## What Changes

- A new **`activity`** side-panel Tool (`src/lib/store.ts` `WorkspaceState.Tool`)
  with an `ActivityPanel` React component listing recent agent file changes,
  newest first, each navigable to open the file (and jump to the changed lines
  when known).
- An **activity feed store** (`src/lib/activity.ts`): derives agent-attributed
  change events from the file-watcher stream while a review is in flight,
  coalescing rapid edits per file into a rolling entry (path, change kind
  create/modify/delete, last-touched time).
- **Watcher tie-in**: subscribe to the existing watcher events
  (`src-tauri/src/watcher.rs` → frontend) and treat file mutations occurring
  during/after a dispatched review as agent activity; no new Rust watching is
  introduced beyond emitting the events already produced.
- **Comment mapping** (`src/lib/activity.ts` + `src/lib/comments.ts`): map each
  changed file to the open/dispatched comment(s) anchored in it, so an activity
  entry shows the comment(s) it likely resolves (tie-in with
  comment-resolution-loop). Mapping is a best-effort, clearly-labeled likelihood,
  never an assertion that the comment is resolved.
- **Read-only guarantee**: the panel exposes only navigation (open file / reveal
  comment); it has no controls that send input to or otherwise drive the agent.
- i18n strings (EN + IT) for the panel, empty state, and change-kind labels.

## Capabilities

### Added Capabilities
- `agent-activity`: an honest, read-only panel that surfaces live agent file
  changes and maps each to the comment(s) it likely resolves.

## Out of Scope

- Driving or controlling the agent (start/stop/retry/approve) — read-only only.
- Marking comments as resolved automatically; resolution stays in the
  comment-resolution-loop, here we only show likely links.
- Per-line semantic diff/attribution or git-blame of agent authorship; mapping is
  at file granularity plus comment anchors.
- Streaming or parsing the agent's terminal output as a data source.
