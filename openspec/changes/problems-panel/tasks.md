## 1. Diagnostics store

- [ ] 1.1 Extend `src/lib/diagnostics.ts` to store full diagnostics per file: an `entry` shape `{ message, severity, line, col, endLine?, endCol? }`, keyed by absolute path, alongside (or deriving) the existing error count.
- [ ] 1.2 Add a `setFile(path, entries)` action that replaces the whole-file list on each publish and clears the key when the list is empty; keep `setErrors`/the tree badge working (derive the error count from the entries).
- [ ] 1.3 Add a selector/helper for aggregate counts by severity across the project.

## 2. LSP wiring

- [ ] 2.1 Widen `tapDiagnostics` in `src/lib/lsp.ts` to map every published diagnostic (all severities) to the store entry shape and call `setFile`, instead of only counting severity-1 errors.
- [ ] 2.2 Confirm `reset()` is still called on workspace/project teardown so stale problems don't linger.

## 3. Side-panel tool

- [ ] 3.1 Add `"problems"` to the `Tool` union in `src/lib/store.ts`.
- [ ] 3.2 Add the activity-bar entry (icon + i18n label) and route it to `ProblemsPanel` wherever the other tools (outline/comments/git) are wired.

## 4. Problems panel

- [ ] 4.1 Create `src/components/organisms/ProblemsPanel.tsx`: subscribe to the diagnostics store, group entries by file, render collapsible per-file groups with per-file counts.
- [ ] 4.2 Each row: severity icon (using `--diag-error`/`--diag-warn`/`--diag-info` tokens), message, and `line:col`; clicking calls `useProject.open(path, line)` to jump.
- [ ] 4.3 Header: severity filter toggles (errors/warnings/info) with live aggregate counts; filtering hides non-matching rows and empties groups accordingly.
- [ ] 4.4 Calm empty state ("No problems") when there are no diagnostics (or none match the active filters); keep the panel keyboard-navigable and WCAG AA.

## 5. i18n

- [ ] 5.1 Add EN + IT strings (title, filter labels, count phrasing, empty state) to `src/i18n/locales/en.json` and `it.json`.

## 6. Verify

- [ ] 6.1 typecheck + cargo check + build green.
