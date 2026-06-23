> Two parts: (A) menu wiring of existing commands — mostly done; (B) the new
> file-level behaviours from the VS Code audit (Auto Save, New/Open/Save As/Save
> All/Revert, Open Recent, Open View, diagnostics nav).

## 1. Menu structure & wiring (Rust + frontend)

- [x] 1.1 Selection / Terminal / Help submenus; extend File/Edit/Go/View.
- [x] 1.2 Stable ids per custom item; frontend routes them to existing commands.
- [x] 1.3 Appearance/Theme submenu.
- [x] 1.4 Menu events route to the **focused window** only (multi-window correct).
- [ ] 1.5 Accelerators on items mirror the in-app shortcuts. — DEFERRED BY DESIGN:
      custom items carry no accelerators so the in-app keymap isn't shadowed; the
      Keyboard Shortcuts panel is the single source of truth instead.
- [ ] 1.6 Disable file-scoped items when no file is open. — DEFERRED: items no-op
      safely when no editor is open; native enable/disable plumbing not worth it yet.
- [x] 1.7 Wire the remaining ➕ items: Toggle Block Comment, Expand/Shrink
      Selection, Select All Occurrences, Duplicate Selection, Go to Type
      Definition / Implementation, Switch Editor (next/prev tab), Send Review,
      Launch Claude/Codex/Copilot, Command Palette (View). (About = native macOS
      item; Audit stays on the tree context menu where it has a target.)

## 2. Open Recent (dynamic)

- [x] 2.1 Open Recent opens the command palette in recents mode (live list, fuzzy
      filter, keyboard-first) instead of a static native submenu — same job, less
      native rebuild plumbing, and it scales past a handful of entries.

## 3. New file-level behaviours

- [x] 3.1 **Auto Save**: setting (off / after-delay / on-focus-change), persisted
      (`useSettings.autoSave`); File-menu submenu; debounced write on edit /
      write on blur, via `saveFile` so it doesn't mark the file unread.
- [x] 3.2 New File (create + open), Open File… (file picker).
- [x] 3.3 Save As…, Revert File — confined to the project root. (Save All ≡ Save:
      the editor is single-buffer, so only the active doc can be dirty.)

## 4. View & navigation behaviours

- [x] 4.1 Open View ▶ submenu → switch the sidebar tool.
- [x] 4.2 View chrome toggles (persisted): Activity Bar, Status Bar, Breadcrumbs,
      Centered/Reading Layout, Render Whitespace. (Render Control Characters
      deferred — niche.)
- [ ] 4.3 Editor Layout ▶ (split direction). — DEFERRED: editor split is a single
      side-by-side; no direction concept yet.
- [x] 4.4 Go: Next / Previous Problem, Go to Bracket, Last Edit Location.
- [x] 4.5 Selection: Add Cursor Above / Below / to Line Ends; Column Selection via
      Alt-drag (rectangularSelection).

## 5. Terminal commands

- [x] 5.1 Clear Terminal, Restart Terminal (focused pane).
- [x] 5.2 Send Review, Launch Claude/Codex/Copilot, Split wired. (Audit on tree
      context menu; Move via drag-and-drop.)

## 6. Deferred (need features Reado lacks)

- [ ] 6.1 Minimap · Problems panel · Output panel — tracked, not in this change.

## 7. Glue & verify

- [x] 5.1 i18n: all menu labels EN + IT.
- [ ] 5.2 Every item triggers its command on macOS; builds on Win/Linux. — macOS
      verified; Win/Linux build needs a machine to confirm.
- [x] 5.3 typecheck + cargo check + vite build green.
