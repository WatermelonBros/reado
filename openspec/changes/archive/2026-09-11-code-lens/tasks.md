## 1. The lens list

- [x] 1.1 `documentFeature` grows an optional `refine` step, so a feature can
      resolve each item before it is stored — code lenses arrive titleless from
      every server that sets `resolveProvider`.
- [x] 1.2 `codeLenses()` on `textDocument/codeLens`, gated on `codeLensProvider`,
      resolving each lens through `codeLens/resolve` (bounded, failures dropped).
- [x] 1.3 A `codeLens` setting (persisted, default on) read at fetch time, so
      turning it off stops the requests and clears what is drawn.

## 2. Drawing them

- [x] 2.1 Block widget above the lens's line, indented to match it; several
      lenses on one line share a row.
- [x] 2.2 Theme tokens, not literal colours — a lens is chrome, not code.

## 3. Acting on one

- [x] 3.1 Click → locations from the command's arguments: one opens, several go
      to a `ContextMenu` of `file:line` at the click point.
- [x] 3.2 Otherwise `workspace/executeCommand` when the server advertises it;
      otherwise a notice naming the command.

## 4. Servers that need asking

Measured against the real `typescript-language-server` 6.0.0, by instrumenting a
private copy of it, on a file with an interface, two implementing classes and a
function:

- [x] 4.1 Declare `textDocument.codeLens` in the client capabilities. Undeclared,
      `registerHandlers` never builds the lens providers and `codeLens` returns
      `[]` — "NO PROVIDERS" in the instrumented server.
- [x] 4.2 Send the settings with `workspace/didChangeConfiguration`. With the
      capability but no push, the providers exist and answer `impl=0 refs=0`:
      their setting lives in the workspace configuration, which starts off and
      which the server never asks about (it only ever asks for
      `formattingOptions`). With both: 1 + 12 lenses.
- [x] 4.3 Re-send when the setting changes, or turning lenses on mid-session
      leaves the server refusing to compute what Reado has started asking for.
- [x] 4.4 No `initializationOptions` for the lenses: v6 destructures that object
      down to `tsserver`/`plugins`/`preferences` and drops the lens keys on the
      floor, so a knob there would have been config that does nothing.
- [x] 4.5 Answer `workspace/codeLens/refresh` and ask again — the server sends it
      within its first 50ms, while its own answer is still empty.

## 5. Verify

- [x] 5.1 Unit tests: resolve-then-show, the off switch, the invalidate-on-edit
      rule, and each of the three click outcomes.
- [x] 5.2 i18n for every shipped locale.
- [x] 5.3 CHANGELOG entry under `[Unreleased]`.
