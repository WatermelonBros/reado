## 1. Fetch and cache

- [x] 1.1 Request `textDocument/foldingRange` per document version, cached; the
      cache is invalidated by a change, not by a timer.
- [x] 1.2 Map LSP ranges (line-based, optional `startCharacter`/`endCharacter`) to
      the `{from, to}` offsets `foldService` expects — folding from the end of the
      start line, as the syntax folder does.

## 2. Register the service

- [x] 2.1 `foldService.of(...)` in the LSP extension bundle: answer from the cache,
      return null when the server has nothing for that line so the syntax folder
      answers instead.
- [x] 2.2 The first request for a document may not have answered yet — return null
      and let the fold gutter update when it lands.

## 3. Verify

- [x] 3.1 Unit tests: an import block reported by the server folds; a line the
      server doesn't cover still folds by syntax; no provider means no request.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
