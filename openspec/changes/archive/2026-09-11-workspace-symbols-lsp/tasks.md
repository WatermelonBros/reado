## 1. Ask the servers

- [x] 1.1 `lspWorkspaceSymbols(query)`: send `workspace/symbol` to every live
      client for the open roots, map `SymbolInformation` / `WorkspaceSymbol` (both
      shapes) to the picker's item shape, resolving `location` URIs to paths.
- [x] 1.2 Debounce per keystroke and abandon a superseded query's answer.
- [x] 1.3 A server that errors or does not offer the request contributes nothing.

## 2. Merge

- [x] 2.1 Index results render immediately; server results are merged in as they
      arrive.
- [x] 2.2 Dedupe on (name, file, line) — in the merge, and again inside
      `lspWorkspaceSymbols` where two attached servers both report a symbol. The
      index's entry wins, so its ranking is preserved.

## 3. Verify

- [x] 3.1 Unit tests: both response shapes map, results outside the workspace are
      kept with their absolute path, duplicates collapse, a failing server leaves
      the index's results intact, and a stale answer is discarded.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
