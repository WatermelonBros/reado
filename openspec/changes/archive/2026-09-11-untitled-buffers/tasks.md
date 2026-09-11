## 1. A document that is not a file

- [x] 1.1 `untitled.ts`: the `untitled:N` tab id (no real path can collide — they
      are absolute), `isUntitled`, the display name, and the store that holds
      each buffer's text, persisted per project.
- [x] 1.2 `nextUntitledName()` — the lowest free number, so closing and
      reopening does not climb.

## 2. It opens, it types, it stays

- [x] 2.1 The editor loads an untitled tab from the store instead of `readFile`,
      and skips what needs a file: git diff lines, re-anchoring, the on-disk
      change listener.
- [x] 2.2 The buffer's text is written back to the store as it is edited, so
      switching tabs (which unmounts the view) does not drop it.
- [x] 2.3 Tab, breadcrumb and window title show `Untitled-N`, not the raw id.

## 3. Saving

- [x] 3.1 `saveDocument` on an untitled buffer runs the Save As flow; on success
      the untitled tab is replaced in place by the new file's tab and its stored
      text is dropped.
- [x] 3.2 Closing an untitled buffer with text asks first; empty closes silently.

## 4. Entry points

- [x] 4.1 File ▸ New Untitled File, the palette, and ⌘N — working with no
      project open.

## 5. Verify

- [x] 5.1 Unit tests: naming, the text surviving a tab switch, save-as
      replacement, the close prompt, and that no file command is issued for an
      untitled tab.
- [x] 5.2 i18n for every shipped locale.
- [x] 5.3 CHANGELOG entry under `[Unreleased]`.
