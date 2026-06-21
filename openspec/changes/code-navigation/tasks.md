## 1. Workspace symbols

- [x] 1.1 Backend: a `list_symbols(root)` (or reuse the definition index) returning {name, path, line, kind} across the project, capped for responsiveness.
- [x] 1.2 Palette mode `symbols:workspace` (fuzzy over names) bound to `⌘T`; selecting opens path+line via `useProject.open`.
- [x] 1.3 Add to the Go menu and command palette.

## 2. Peek definition

- [x] 2.1 Resolve the symbol at the cursor with the existing `find_definition`; fetch the target's surrounding lines.
- [x] 2.2 Inline panel over the editor (CodeMirror panel or an overlay) showing the snippet; Escape closes, an action opens the file; "no definition found" state.
- [ ] 2.3 Bind a key (e.g. `⌥F12`) + Go menu + palette entry.

## 3. Verify

- [x] 3.1 typecheck + cargo check + build green.
