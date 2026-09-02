## Why

The native menu bar exposes only a slice of what Reado can do, and a side-by-side
audit against VS Code shows real gaps — both undiscoverable existing commands and
genuinely missing behaviours (Auto Save, New File, Open Recent, Save As, Revert,
…). This change does the full audit of VS Code's top menus, decides what fits a
**read-first** IDE, and brings the menu to parity: surfacing existing commands
*and* adding the small set of new behaviours a user expects from "File".

## VS Code menu audit → Reado decision (item by item)

Legend: ✅ have · ➕ wire (command exists) · 🆕 new behaviour · 🔭 new, deferred
(needs a feature Reado lacks) · ⏭️ skip (not read-first).

### File
✅ New Window · ✅ Open Folder · ✅ Save · ✅ Format Document · ✅ Reopen Closed
Editor · ✅ Close Editor · ✅ Close Folder/Project · ✅ Close Window ·
🆕 New File… · 🆕 Open File… · 🆕 Open Recent ▶ (dynamic) · 🆕 Save As… ·
🆕 Save All · 🆕 Revert File · 🆕 Auto Save (off / after-delay / on-focus-change) ·
⏭️ Open Workspace · ⏭️ Add Folder to Workspace · ⏭️ Share · ⏭️ Preferences split
(Reado has Settings)

### Edit
✅ Undo · ✅ Redo · ✅ Cut · ✅ Copy · ✅ Paste · ✅ Find · ✅ Replace · ✅ Find in
Files · ✅ Replace in Files · ✅ Toggle Line Comment · ➕ Toggle Block Comment ·
⏭️ Emmet (Expand Abbreviation, …)
> (Edit in VS Code is actually small; this is essentially complete.)

### Selection
✅ Add (Next) Occurrence · ✅ Copy Line Up/Down · ✅ Move Line Up/Down ·
➕ Select All (⌘A) · ➕ Expand Selection · ➕ Shrink Selection · ➕ Duplicate
Selection · ➕ Add Previous Occurrence · ➕ Select All Occurrences · ➕ Column
Selection Mode · 🆕 Add Cursor Above · 🆕 Add Cursor Below · 🆕 Add Cursors to Line
Ends · ⏭️ Switch to Ctrl+Click for Multi-Cursor (a setting)

### View — the big one
✅ Toggle Sidebar (Primary Side Bar) · ✅ Toggle Terminal (Panel) · ✅ Split Editor
· ✅ Word Wrap · ✅ Focus Mode (≈ Zen Mode) · ✅ Knowledge Graph · ✅ Documentation ·
✅ Appearance → Theme · ✅ Zoom In/Out/Reset · ➕ Command Palette ·
🆕 **Open View ▶** (Files / Search / Comments / Outline / Source Control /
Extensions) · 🆕 Toggle Activity Bar (tool rail) · 🆕 Toggle Status Bar ·
🆕 Toggle Breadcrumbs · 🆕 Centered/Reading Layout (≈ reading width) ·
🆕 Render Whitespace · 🆕 Render Control Characters · 🆕 Editor Layout ▶
(Split Up/Down/Left/Right, Single) ·
🔭 Minimap (Reado has none — add only if we want it) · 🔭 Problems panel ·
🔭 Output panel · ⏭️ Secondary Side Bar · ⏭️ Run view · ⏭️ Menu Bar visibility
(macOS) · ⏭️ Editor Tabs visibility · ⏭️ Grid/columns multi-layout (2-pane only)

### Go
✅ Back · ✅ Forward · ✅ Go to File · ✅ Go to Symbol in File · ✅ Go to Symbol in
Project · ✅ Command Palette · ✅ Search in Project · ✅ Go to Definition ·
✅ Find References · ✅ Go to Line · ➕ Go to Type Definition · ➕ Go to
Implementation · ➕ Switch Editor (Next/Prev Tab) · 🆕 Next Problem ·
🆕 Previous Problem · 🆕 Go to Bracket · 🆕 Last Edit Location · ➕ Go to
Declaration · ⏭️ Switch Group · ⏭️ Next/Prev Change (diff-only)

### Run
⏭️ Entire menu (no debugger — read-first). Reado's "run" is launching AI agents,
which lives under Terminal.

### Terminal
✅ New Terminal · ✅ Split Terminal · ➕ Toggle Split Orientation · ➕ Move Terminal
(dock bottom/right) · ➕ Send Review · ➕ Audit · ➕ Launch Claude · ➕ Launch Codex
· ➕ Launch Copilot · 🆕 Clear Terminal · 🆕 Restart Terminal ·
⏭️ Run Task / Run Build Task / Run Active File / Run Selected Text / Show Running
Tasks / Restart Task / Terminate Task / Configure Tasks (no task runner — agents
replace this)

### Window
✅ Minimize · ✅ Full Screen · ➕ New Window · 🆕 Zoom (window) · ⏭️ Bring All to
Front (standard, auto), window list (auto)

### Help
✅ Documentation · ✅ Website · ✅ Report Issue · ✅ Release Notes · ✅ Check for
Updates · ✅ Keyboard Shortcuts · ➕ Welcome · ➕ About

## What Changes

- Wire every ➕ item to its existing command via the `menu` event.
- Add the 🆕 behaviours, grouped:
  - **File**: New/Open File, Open Recent (dynamic), Save As, Save All, Revert,
    **Auto Save** (setting + File-menu toggle).
  - **View**: Open View ▶, and chrome toggles — Activity Bar, Status Bar,
    Breadcrumbs, Centered/Reading Layout, Render Whitespace, Render Control
    Characters, Editor Layout ▶ (split direction).
  - **Selection / Go**: Add Cursor Above/Below & to Line Ends, Go to Bracket,
    Last Edit Location, Next/Previous Problem.
  - **Terminal**: Clear / Restart terminal (alongside the wired Send Review,
    Audit, Launch agents, Move/Split).
- 🔭 deferred (need a feature we don't have): Minimap, Problems panel, Output
  panel — out of this change; tracked for later.
- **Accelerators** on menu items mirror the in-app shortcuts (documenting them);
  file-scoped items are **disabled** when no file is open.
- Menu events route to the **focused window** only (multi-window correct).
- Labels localised EN + IT.

## Capabilities

### Added Capabilities
- `application-menu`: the native menu bar structure, its mapping to Reado
  commands, and the new file-level behaviours (Auto Save, New/Open/Save As/Save
  All/Revert File, Open Recent).

## Out of Scope
- Debugger/Run menus, multi-root workspaces, Emmet, user-customizable keybindings.
