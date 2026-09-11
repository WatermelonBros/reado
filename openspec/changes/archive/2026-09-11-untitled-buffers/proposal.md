## Why

You cannot open Reado and start typing. `newFile()` (`docInfo.ts:731`) asks for a
path before it will give you a buffer, and refuses outright without a project
open. There is no `Untitled-1`, no scratch buffer to paste a stack trace into and
look at it, no place to draft a snippet that is not yet a file anybody wants on
disk.

That is the shape of the whole document model, not an oversight: tabs are
absolute path strings, the editor loads a tab by reading that path, saving writes
back to it, and the session restores the list. Every one of those steps assumes
the document *is* a file. A scratch buffer is the case that proves the model can
hold a document that is not one yet.

## What Changes

- **New Untitled File** (File menu, palette, ⌘N — which moves here from New
  File…, as it does in every editor that has both) opens an empty buffer named
  `Untitled-1`, `Untitled-2`, … — with no project open too, which is the moment
  it is most wanted.
- The buffer is a tab like any other: switch away, come back, split it, close it.
  Its text lives in Reado rather than on disk, so nothing reads or writes a file
  for it — no git status, no comment anchors, no on-disk reload.
- Saving one is Save As: ⌘S asks where it goes, writes it, and the untitled tab
  becomes the tab for the real file. Closing one with text in it asks first, the
  way an unsaved file does.
- The language is chosen from the name you save it under; before that it is plain
  text.
- Session restore keeps untitled buffers *and their text*, per project — a
  scratch buffer that vanished on restart would be a worse promise than not
  offering one.

## Capabilities

### Added Capabilities

- `project-workspace`: untitled buffers, saving one, and restoring them.
