# 3 — Editor / Tabs

CodeMirror 6 editor + tab bar. Entry: `Editor.tsx`, `Tabs.tsx`. CM ignores synthetic input — drive edits via the `window.__reado` hook.

**Cases: 122.**

---

### TC-EDIT-0001 — Open a file into a tab
**As a** user, **when I** open a file, **I expect** a tab and its content.
- **Result:** PASS

### TC-EDIT-0002 — Open multiple files
**As a** user, **when I** open several files, **I expect** one tab each, latest focused.
- **Result:** PASS

### TC-EDIT-0003 — Switch tabs
**As a** user, **when I** click another tab, **I expect** the editor shows that file.
- **Result:** PASS

### TC-EDIT-0004 — Close a tab
**As a** user, **when I** click a tab's "Close <file>", **I expect** the tab closes, neighbour focuses.
- **Result:** PASS

### TC-EDIT-0005 — Close all tabs → welcome
**As a** user, **when I** close every tab, **I expect** the welcome/empty state.
- **Result:** TODO

### TC-EDIT-0006 — Reorder tabs (drag)
**As a** user, **when I** drag a tab, **I expect** the tab order changes.
- **Result:** TODO

### TC-EDIT-0007 — Edit the buffer
**As a** user, **when I** type into the editor, **I expect** the buffer updates.
- **Result:** PASS

### TC-EDIT-0008 — Dirty indicator
**As a** user, **when I** make an unsaved edit, **I expect** the file marked dirty.
- **Result:** PASS

### TC-EDIT-0009 — Undo
**As a** user, **when I** press Cmd+Z, **I expect** the last edit reverted.
- **Result:** PASS

### TC-EDIT-0010 — Redo
**As a** user, **when I** press Cmd+Shift+Z, **I expect** the undone edit reapplied.
- **Result:** TODO

### TC-EDIT-0011 — Save with Cmd+S
**As a** user, **when I** press Cmd+S, **I expect** the buffer written to disk, dirty cleared.
- **Result:** MANUAL (driver limit)

### TC-EDIT-0012 — Auto-save afterDelay
**As a** user, **when I** stop typing ~1s with auto-save afterDelay, **I expect** the file saved.
- **Result:** MANUAL

### TC-EDIT-0013 — Auto-save onFocusChange
**As a** user, **when I** blur the editor with unsaved edits, **I expect** the file saved.
- **Result:** MANUAL

### TC-EDIT-0014 — Find in file (Cmd+F)
**As a** user, **when I** press Cmd+F, **I expect** the search panel opens.
- **Result:** PASS

### TC-EDIT-0015 — Find next / previous
**As a** user, **when I** search then Enter / Shift+Enter, **I expect** navigation between matches.
- **Result:** TODO

### TC-EDIT-0016 — Replace in file
**As a** user, **when I** use the in-editor replace, **I expect** matches replaced.
- **Result:** TODO

### TC-EDIT-0017 — Go to line (Cmd+G)
**As a** user, **when I** press Cmd+G, **I expect** a go-to-line prompt.
- **Result:** PASS

### TC-EDIT-0018 — Breadcrumb path
**As a** user, **when I** open a file, **I expect** a breadcrumb of its path.
- **Result:** PASS

### TC-EDIT-0019 — Toggle blame
**As a** user, **when I** toggle blame on a tracked file, **I expect** a per-line author/commit gutter.
- **Result:** PASS

### TC-EDIT-0020 — Toggle diff
**As a** user, **when I** toggle diff on a modified file, **I expect** changed lines highlighted vs HEAD.
- **Result:** PASS

### TC-EDIT-0021 — No diff on a clean file
**As a** user, **when I** toggle diff on an unmodified file, **I expect** no changes shown, graceful.
- **Result:** TODO

### TC-EDIT-0022 — Sticky scroll
**As a** user, **when I** scroll inside a long function, **I expect** the enclosing scope header stays pinned.
- **Result:** TODO

### TC-EDIT-0023 — Structure ribbon
**As a** user, **when I** open a symbol-rich file, **I expect** a scrollable symbol/diagnostic overview.
- **Result:** TODO

### TC-EDIT-0024 — Line wrapping toggle
**As a** user, **when I** toggle line wrapping, **I expect** long lines wrap/unwrap.
- **Result:** TODO

### TC-EDIT-0025 — Whitespace rendering
**As a** user, **when I** toggle whitespace rendering, **I expect** spaces/tabs shown.
- **Result:** TODO

### TC-EDIT-0026 — Swap split panes
**As a** user, **when I** click "Scambia pannelli", **I expect** the two panes swap.
- **Result:** TODO

### TC-EDIT-0027 — Reopening an open file (LSP)
**As a** user, **when I** open a file already open, **I expect** no LSP didOpen error.
- **Result:** PASS → BUG-2 fixed

### TC-EDIT-0028 — No console errors editing
**As a** user, **when I** edit/switch/close/diff/blame, **I expect** no uncaught errors.
- **Result:** PASS

### TC-EDIT-0029 — Edit a JavaScript file
**As a** user, **when I** type into a JavaScript file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0030 — Edit a TypeScript file
**As a** user, **when I** type into a TypeScript file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0031 — Edit a Python file
**As a** user, **when I** type into a Python file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0032 — Edit a Markdown file
**As a** user, **when I** type into a Markdown file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0033 — Edit a JSON file
**As a** user, **when I** type into a JSON file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0034 — Edit an SVG file
**As a** user, **when I** type into an SVG file, **I expect** the buffer to update and mark dirty.
- **Result:** TODO

### TC-EDIT-0035 — Editor under reado-dark
**As a** user, **when I** view code in reado-dark, **I expect** syntax colors with adequate contrast.
- **Result:** TODO

### TC-EDIT-0036 — Editor under reado-light
**As a** user, **when I** view code in reado-light, **I expect** syntax colors with adequate contrast.
- **Result:** TODO

### TC-EDIT-0037 — Editor under reado-sepia
**As a** user, **when I** view code in reado-sepia, **I expect** syntax colors with adequate contrast.
- **Result:** TODO

### TC-EDIT-0038 — Editor under reado-high-contrast
**As a** user, **when I** view code in reado-high-contrast, **I expect** syntax colors with adequate contrast.
- **Result:** TODO

### TC-EDIT-0039 — Editor at zoom 0.8
**As a** user, **when I** view the editor at zoom 0.8, **I expect** text scales crisply, gutters aligned, no clipping.
- **Result:** TODO

### TC-EDIT-0040 — Editor at zoom 1.0
**As a** user, **when I** view the editor at zoom 1.0, **I expect** text scales crisply, gutters aligned, no clipping.
- **Result:** TODO

### TC-EDIT-0041 — Editor at zoom 1.25
**As a** user, **when I** view the editor at zoom 1.25, **I expect** text scales crisply, gutters aligned, no clipping.
- **Result:** TODO

### TC-EDIT-0042 — Editor at zoom 1.5
**As a** user, **when I** view the editor at zoom 1.5, **I expect** text scales crisply, gutters aligned, no clipping.
- **Result:** TODO

### TC-EDIT-0043 — Editor at zoom 2.0
**As a** user, **when I** view the editor at zoom 2.0, **I expect** text scales crisply, gutters aligned, no clipping.
- **Result:** TODO

### TC-EDIT-0044 — 1 tabs open
**As a** user, **when I** open 1 files, **I expect** tabs overflow/scroll gracefully, active tab visible.
- **Result:** TODO

### TC-EDIT-0045 — 5 tabs open
**As a** user, **when I** open 5 files, **I expect** tabs overflow/scroll gracefully, active tab visible.
- **Result:** TODO

### TC-EDIT-0046 — 12 tabs open
**As a** user, **when I** open 12 files, **I expect** tabs overflow/scroll gracefully, active tab visible.
- **Result:** TODO

### TC-EDIT-0047 — 30 tabs open
**As a** user, **when I** open 30 files, **I expect** tabs overflow/scroll gracefully, active tab visible.
- **Result:** TODO

### TC-EDIT-0048 — toggle line comment in JS
**As a** user, **when I** run "toggle line comment" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0049 — toggle line comment in TS
**As a** user, **when I** run "toggle line comment" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0050 — toggle line comment in Python
**As a** user, **when I** run "toggle line comment" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0051 — toggle line comment in Rust
**As a** user, **when I** run "toggle line comment" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0052 — toggle line comment in JSON
**As a** user, **when I** run "toggle line comment" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0053 — toggle block comment in JS
**As a** user, **when I** run "toggle block comment" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0054 — toggle block comment in TS
**As a** user, **when I** run "toggle block comment" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0055 — toggle block comment in Python
**As a** user, **when I** run "toggle block comment" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0056 — toggle block comment in Rust
**As a** user, **when I** run "toggle block comment" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0057 — toggle block comment in JSON
**As a** user, **when I** run "toggle block comment" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0058 — add next occurrence in JS
**As a** user, **when I** run "add next occurrence" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0059 — add next occurrence in TS
**As a** user, **when I** run "add next occurrence" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0060 — add next occurrence in Python
**As a** user, **when I** run "add next occurrence" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0061 — add next occurrence in Rust
**As a** user, **when I** run "add next occurrence" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0062 — add next occurrence in JSON
**As a** user, **when I** run "add next occurrence" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0063 — select all occurrences in JS
**As a** user, **when I** run "select all occurrences" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0064 — select all occurrences in TS
**As a** user, **when I** run "select all occurrences" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0065 — select all occurrences in Python
**As a** user, **when I** run "select all occurrences" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0066 — select all occurrences in Rust
**As a** user, **when I** run "select all occurrences" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0067 — select all occurrences in JSON
**As a** user, **when I** run "select all occurrences" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0068 — add cursor above in JS
**As a** user, **when I** run "add cursor above" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0069 — add cursor above in TS
**As a** user, **when I** run "add cursor above" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0070 — add cursor above in Python
**As a** user, **when I** run "add cursor above" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0071 — add cursor above in Rust
**As a** user, **when I** run "add cursor above" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0072 — add cursor above in JSON
**As a** user, **when I** run "add cursor above" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0073 — add cursor below in JS
**As a** user, **when I** run "add cursor below" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0074 — add cursor below in TS
**As a** user, **when I** run "add cursor below" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0075 — add cursor below in Python
**As a** user, **when I** run "add cursor below" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0076 — add cursor below in Rust
**As a** user, **when I** run "add cursor below" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0077 — add cursor below in JSON
**As a** user, **when I** run "add cursor below" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0078 — go to bracket in JS
**As a** user, **when I** run "go to bracket" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0079 — go to bracket in TS
**As a** user, **when I** run "go to bracket" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0080 — go to bracket in Python
**As a** user, **when I** run "go to bracket" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0081 — go to bracket in Rust
**As a** user, **when I** run "go to bracket" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0082 — go to bracket in JSON
**As a** user, **when I** run "go to bracket" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0083 — expand selection in JS
**As a** user, **when I** run "expand selection" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0084 — expand selection in TS
**As a** user, **when I** run "expand selection" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0085 — expand selection in Python
**As a** user, **when I** run "expand selection" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0086 — expand selection in Rust
**As a** user, **when I** run "expand selection" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0087 — expand selection in JSON
**As a** user, **when I** run "expand selection" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0088 — shrink selection in JS
**As a** user, **when I** run "shrink selection" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0089 — shrink selection in TS
**As a** user, **when I** run "shrink selection" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0090 — shrink selection in Python
**As a** user, **when I** run "shrink selection" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0091 — shrink selection in Rust
**As a** user, **when I** run "shrink selection" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0092 — shrink selection in JSON
**As a** user, **when I** run "shrink selection" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0093 — copy line up in JS
**As a** user, **when I** run "copy line up" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0094 — copy line up in TS
**As a** user, **when I** run "copy line up" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0095 — copy line up in Python
**As a** user, **when I** run "copy line up" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0096 — copy line up in Rust
**As a** user, **when I** run "copy line up" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0097 — copy line up in JSON
**As a** user, **when I** run "copy line up" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0098 — copy line down in JS
**As a** user, **when I** run "copy line down" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0099 — copy line down in TS
**As a** user, **when I** run "copy line down" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0100 — copy line down in Python
**As a** user, **when I** run "copy line down" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0101 — copy line down in Rust
**As a** user, **when I** run "copy line down" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0102 — copy line down in JSON
**As a** user, **when I** run "copy line down" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0103 — go to last edit in JS
**As a** user, **when I** run "go to last edit" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0104 — go to last edit in TS
**As a** user, **when I** run "go to last edit" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0105 — go to last edit in Python
**As a** user, **when I** run "go to last edit" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0106 — go to last edit in Rust
**As a** user, **when I** run "go to last edit" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0107 — go to last edit in JSON
**As a** user, **when I** run "go to last edit" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0108 — format file in JS
**As a** user, **when I** run "format file" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0109 — format file in TS
**As a** user, **when I** run "format file" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0110 — format file in Python
**As a** user, **when I** run "format file" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0111 — format file in Rust
**As a** user, **when I** run "format file" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0112 — format file in JSON
**As a** user, **when I** run "format file" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0113 — peek definition in JS
**As a** user, **when I** run "peek definition" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0114 — peek definition in TS
**As a** user, **when I** run "peek definition" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0115 — peek definition in Python
**As a** user, **when I** run "peek definition" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0116 — peek definition in Rust
**As a** user, **when I** run "peek definition" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0117 — peek definition in JSON
**As a** user, **when I** run "peek definition" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0118 — go to definition in JS
**As a** user, **when I** run "go to definition" in a JS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0119 — go to definition in TS
**As a** user, **when I** run "go to definition" in a TS file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0120 — go to definition in Python
**As a** user, **when I** run "go to definition" in a Python file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0121 — go to definition in Rust
**As a** user, **when I** run "go to definition" in a Rust file, **I expect** the command performs correctly.
- **Result:** TODO

### TC-EDIT-0122 — go to definition in JSON
**As a** user, **when I** run "go to definition" in a JSON file, **I expect** the command performs correctly.
- **Result:** TODO
