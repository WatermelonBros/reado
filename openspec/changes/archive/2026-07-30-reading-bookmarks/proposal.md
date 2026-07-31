## Why

Reado is read-first, and while reading unfamiliar code you constantly hit a line
you want to come back to — without yet having anything to say about it. Today the
only anchor Reado offers is a **comment**, but comments are durable review
artifacts in the comment↔AI loop (you annotate, the agent resolves). Forcing a
comment for "I'll return here" pollutes that loop with throwaway notes and adds
friction (you must write something).

Reading bookmarks fill the gap: a one-keystroke, annotation-free pin on a line or
region that you can list and jump back to. They are a personal navigation aid,
quiet in the gutter, never dispatched to an agent — deliberately distinct from
comments so the "comment is the unit" thesis stays clean.

## What Changes

- **Add/remove bookmarks** at the active line or selected region from the editor
  (gutter click + command), toggling cleanly; new `src/lib/bookmarks.ts` state and
  a `src/lib/bookmarkGutter.ts` CodeMirror gutter, modeled on the existing
  `src/lib/commentGutter.ts`.
- **Quiet gutter marker** that is visually distinct from the comment marker (a
  small filled pin/dot in `text-faint`/`accent`, no badge), so bookmarks never
  read as review state.
- **List + jump**: a new `"bookmarks"` side-panel Tool (added to `Tool` in
  `src/lib/store.ts`) listing this project's bookmarks (file, line, snippet) that
  jump to the location on click, plus a Command Center / command-palette mode to
  jump to a bookmark without opening the panel.
- **Persistence per project** under `.reado/bookmarks.json` (gitignored like the
  rest of `.reado/`), with Rust commands `get_bookmarks` / `set_bookmarks` in a new
  `src-tauri/src/bookmarks.rs` module, mirroring `src-tauri/src/progress.rs`.
- **i18n** copy for the new panel, actions, and empty state in
  `src/i18n/locales/en.json` and `it.json`.

## Capabilities

### Added Capabilities
- `reading-bookmarks`: lightweight, annotation-free pins on lines/regions that
  persist per project, list and jump, and are quietly marked in the gutter —
  distinct from comments.

## Out of Scope

- Any annotation, threading, status, or AI/agent dispatch on bookmarks (that is
  what comments are for).
- Cross-project / global bookmark lists, or syncing/sharing bookmarks with others.
- Folder- or symbol-level bookmarks; bookmarks anchor to a line or region only.
- Orphan-tracking / re-anchoring on edit beyond the gutter following CodeMirror's
  normal line mapping within a session.
