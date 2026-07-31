## Why

Reado is a tool for *reading* a codebase, yet there's no notion of what you've
already read. In a large repo that's the missing map: which files have I been
through, and what's left. No mainstream IDE does this well — for a read-first
tool it's identity-defining.

## What Changes

- A file can be marked **read** (and unread). Reado also auto-marks a file read
  when you've actually scrolled through it (a light heuristic), with manual
  override always winning.
- The file tree shows a quiet **read/unread** indicator per file; folders show
  aggregate progress (e.g. read / total).
- A per-project **reading progress** summary (files read / total in scope).
- State is persisted per project (in `.reado/`, gitignored like the rest), so it
  survives restarts and is personal.

## Capabilities

### Added Capabilities
- `reading-progress`: mark files read/unread, auto-mark on full scroll, tree
  indicators and a per-project progress summary, persisted per project.
