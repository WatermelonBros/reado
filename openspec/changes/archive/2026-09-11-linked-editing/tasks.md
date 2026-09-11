## 1. Ask the server

- [x] 1.1 On cursor move (debounced), when `linkedEditingRangeProvider` is set,
      request `textDocument/linkedEditingRange` for the caret position.
- [x] 1.2 Hold the answer in a `StateField` as mapped ranges, dropped as soon as
      the caret leaves them or the answer's document version is stale.
- [x] 1.3 Decorate the partner range.

## 2. Mirror the edit

- [x] 2.1 A `transactionFilter` that, for a change entirely inside one linked
      range, appends the same change to the others (mapped through the original
      transaction) — one undo step, and it cannot half-apply.
- [x] 2.2 An edit that crosses or leaves the range drops the link instead of
      mirroring nonsense.

## 3. Verify

- [x] 3.1 Unit tests: typing in the open tag rewrites the close tag; one undo
      takes back both; an edit spanning the range boundary mirrors nothing; no
      provider means no request.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
