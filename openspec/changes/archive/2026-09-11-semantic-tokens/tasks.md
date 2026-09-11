## 1. The request

- [x] 1.1 Read the server's legend from its capabilities; request full, and
      `semanticTokens/full/delta` when the server offers it.
- [x] 1.2 Decode the flat integer encoding (5 per token, line/char deltas).
- [x] 1.3 Drop an answer whose document has moved on, like the other features do.
- [x] 1.4 A setting, read at fetch time so off means no request.

## 2. The colours

- [x] 2.1 Map LSP token types onto the theme's existing tokens; modifiers that
      carry meaning (`deprecated`) get their own treatment.
- [x] 2.2 Layer over the grammar: a mark decoration on the server's ranges, so
      everything unmentioned keeps what it had.

## 3. Verify

- [x] 3.1 Unit tests: the decoder against a hand-built payload, the overlay, the
      stale-answer drop, the off switch, a server without the capability.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
