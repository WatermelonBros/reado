## Why

The native menu bar (macOS/Windows/Linux) exposes only a thin slice of what
Reado can do — File/Edit/Go/View with a handful of items. Many capabilities that
already exist in the app (back/forward, find references, replace, go to line,
reopen closed tab, split editor, toggle sidebar, theme switch, send review,
audit, commit & push with AI, check for updates) are reachable only by shortcut
or palette, hurting discoverability and the "feels like a real IDE" bar. The menu
should surface the commands Reado already has and add the standard menus a user
expects (Selection, Terminal, Help).

## What Changes

The native menu expands to mirror VS Code's structure where it fits a read-first
IDE. Items map to **existing** in-app commands (via the `menu` event the frontend
already routes), so this is mostly menu wiring, not new behavior.

- **Reado (app)**: add Check for Updates.
- **File**: add Open Recent (submenu of recent projects), Reopen Closed Editor;
  keep Open Folder / Save / Format / Close Editor / Close Project.
- **Edit**: add Replace, Find in Files, Replace in Files, Toggle Comment, Go to
  Line; keep undo/redo/cut/copy/paste/select-all/find.
- **Selection** (new menu): Add Next Occurrence, Select All Occurrences, Copy
  Line Up/Down, Move Line Up/Down.
- **Go**: add Back, Forward, Go to Symbol in File, Find References, Go to Line.
- **View**: add Toggle Sidebar, Split Editor, Toggle Word Wrap, Focus Mode,
  Appearance/Theme submenu; keep terminal/graph/docs/zoom.
- **Terminal** (new menu): New Terminal, Split Terminal, Send Review, Audit.
- **Help** (new menu): Documentation, Website, Report Issue, Check for Updates,
  About / Release notes.
- Accelerators mirror the in-app shortcuts so the menu documents them; commands
  that need editor focus are disabled when no file is open.

Out of scope: Run/Debug menus (IDE-heavy, not part of read-first), and
user-customizable keybindings.

## Capabilities

### Added Capabilities
- `application-menu`: the native menu bar structure and its mapping to existing
  Reado commands across desktop platforms.
