## 1. Diagnostics store

- [x] 1.1 Extend `src/lib/diagnostics.ts` to store full diagnostics per file
      (`DiagItem { line, character, severity, message }`) keyed by absolute path,
      alongside the existing error count.
- [x] 1.2 `setFileDiagnostics(path, items)` replaces the whole-file list on each
      publish and clears the key when empty; the tree badge (`errors`) is derived
      from the entries.
- [x] 1.3 Aggregate counts by severity are computed in the panel + activity bar
      from `byFile`.

## 2. LSP wiring

- [x] 2.1 `tapDiagnostics` in `src/lib/lsp.ts` maps every published diagnostic
      (all severities, with range start + message) and calls `setFileDiagnostics`.
- [x] 2.2 `reset()` still clears diagnostics on teardown.

## 3. Side-panel tool

- [x] 3.1 Added `"problems"` to the `Tool` union in `src/lib/store.ts`.
- [x] 3.2 Activity-bar entry (ProblemsIcon + i18n label), shown when there are
      diagnostics, routed to `ProblemsPanel` in `ProjectView`; badge = count.

## 4. Problems panel

- [x] 4.1 `src/components/organisms/ProblemsPanel.tsx` subscribes to the store and
      groups diagnostics by file, sorted, with per-file headers.
- [x] 4.2 Each row: severity dot (`--diag-error/warn/info`), message, and line;
      clicking calls `open(path, line)` to jump.
- [x] 4.3 Header severity filter chips (errors/warnings/info) with live counts;
      filtering hides non-matching rows and empties groups.
- [x] 4.4 Calm empty state; rows are buttons (keyboard-navigable).

## 5. i18n

- [x] 5.1 EN + IT strings (`problems.*`) added.

## 6. Verify

- [x] 6.1 typecheck + build green (cargo unaffected).

> Scope note: diagnostics reflect what the language servers publish — workspace-
> wide for servers like rust-analyzer, open-file-only for others. Honest by design.
