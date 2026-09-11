## 1. Ask the server

- [x] 1.1 `prepareRenameRange(plugin, pos)` in `lsp.ts`: send
      `textDocument/prepareRename`, accept all three response shapes (a bare
      `Range`, `{range, placeholder}`, `{defaultBehavior}`), map it back to
      document offsets through `plugin.fromPosition`.
- [x] 1.2 Only ask when `serverCapabilities.renameProvider.prepareProvider` is
      set; anything else skips straight to the `wordAt()` path.
- [x] 1.3 A thrown request is a miss, not a failure: fall back to `wordAt()` and
      log at `warn`.

## 2. Use it

- [x] 2.1 `renameSymbolAt` takes its range and current name from the prepared
      range when there is one.
- [x] 2.2 A `null` answer means the server refuses: notify with the existing
      `lsp.renameRefused` string and never open the prompt.
- [x] 2.3 The rename request sends the prepared range's start as its position.

## 3. Verify

- [x] 3.1 Unit test: prepared range wins over `wordAt` (a `@decorator`), `null`
      refuses without prompting, a missing `prepareProvider` still renames, a
      throwing request still renames.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
