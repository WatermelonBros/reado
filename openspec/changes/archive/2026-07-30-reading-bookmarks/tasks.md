## 1. Storage

- [x] 1.1 `src-tauri/src/bookmarks.rs`: persists bookmarks per project as JSON
      under `.reado/bookmarks.json`, each `{ path, line, endLine?, snippet }`;
      commands `get_bookmarks` and `set_bookmarks(bookmarks)` (with a round-trip test).
- [x] 1.2 Commands registered in the Tauri handler; `.reado/` is already ignored.

## 2. State

- [x] 2.1 `src/lib/bookmarks.ts`: store loads on project open; `toggle`/`remove`
      persist via the Rust commands; a file's bookmarked lines are derived in the
      editor.
- [x] 2.2 A one-line snippet is captured at creation (trimmed line text) for the list.

## 3. Editor + gutter

- [x] 3.1 `src/lib/bookmarkGutter.ts` renders a quiet accent pin on bookmarked
      lines, visually distinct from the comment marker (own gutter column).
- [x] 3.2 Toggle from the gutter (click any line) and via the "Toggle bookmark"
      command (cursor line) in the palette.

## 4. List + jump

- [x] 4.1 `"bookmarks"` added to `Tool`; `BookmarksPanel` lists this project's
      bookmarks grouped by file (snippet + line), with a quiet empty state.
- [x] 4.2 Clicking a bookmark opens the file at the line; per-item remove action.
- [x] 4.3 Command-palette "bookmarks" mode to jump without opening the panel.

## 5. i18n

- [x] 5.1 EN + IT copy (`bookmarks.*`).

## 6. Verify

- [x] 6.1 typecheck + cargo check + build green; bookmarks persist (Rust test) and
      are never shown in the comments panel or sent to an agent (separate store,
      separate gutter, no agent dispatch).
