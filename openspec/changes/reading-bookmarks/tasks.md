## 1. Storage

- [ ] 1.1 New `src-tauri/src/bookmarks.rs`: persist bookmarks per project as JSON under `.reado/bookmarks.json` (gitignored), each entry `{ path, line, end_line?, snippet }`; Rust commands `get_bookmarks` and `set_bookmarks(bookmarks)`.
- [ ] 1.2 Register the new commands in the Tauri handler and ensure `.reado/bookmarks.json` is excluded from the file watcher / tree (it already lives under the ignored `.reado/`).

## 2. State

- [ ] 2.1 New `src/lib/bookmarks.ts`: store loading the project's bookmarks on open; `addBookmark`, `removeBookmark`, `toggleBookmark(path, line, endLine?)`, and a selector for a file's bookmarked lines; persist via the Rust commands.
- [ ] 2.2 Capture a one-line snippet for each bookmark at creation time for display in the list.

## 3. Editor + gutter

- [ ] 3.1 New `src/lib/bookmarkGutter.ts` CodeMirror gutter (modeled on `src/lib/commentGutter.ts`) rendering a quiet pin marker on bookmarked lines, visually distinct from the comment marker (no badge, muted/accent dot).
- [ ] 3.2 Toggle a bookmark at the active line or selected region from the editor: gutter click and a command, with a clear add/remove toggle.

## 4. List + jump

- [ ] 4.1 Add `"bookmarks"` to `Tool` in `src/lib/store.ts` and a side panel listing this project's bookmarks (file, line, snippet) grouped by file, with a quiet empty state.
- [ ] 4.2 Clicking a bookmark opens the file and scrolls/places the cursor at the bookmarked line; provide a per-item remove action.
- [ ] 4.3 Command Center / command-palette mode to jump to a bookmark without opening the panel.

## 5. i18n

- [ ] 5.1 Add EN + IT copy for the panel title, add/remove actions, palette mode, and empty state in `src/i18n/locales/en.json` and `it.json`.

## 6. Verify

- [ ] 6.1 typecheck + cargo check + build green; bookmarks survive a restart and never appear in the comments panel or get sent to an agent.
