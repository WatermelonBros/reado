## 1. LSP plumbing (call hierarchy)

- [x] 1.1 `lspPrepareCallHierarchy` + `lspCalls` (incoming/outgoing) in
      `src/lib/lsp.ts` via `textDocument/prepareCallHierarchy` and
      `callHierarchy/incomingCalls|outgoingCalls`.
- [x] 1.2 Returns null when no server is attached / the capability is missing
      (caller marks the panel "unsupported").

## 2. LSP plumbing (type hierarchy)

- [x] 2.1 `lspPrepareTypeHierarchy` + `lspTypes` (super/sub) via
      `textDocument/prepareTypeHierarchy` and `typeHierarchy/supertypes|subtypes`.

## 3. UI

- [x] 3.1 `hierarchy` Tool + `HierarchyPanel`: root header, direction toggle
      (Callers/Callees or Subtypes/Supertypes), one-level results, click to jump.
- [x] 3.2 Triggers `showCallHierarchy` / `showTypeHierarchy` (cursor symbol) from
      the Go menu and the command palette; the panel force-opens with progress.
- [x] 3.3 ActivityBar entry appears once a hierarchy has been requested.

## 4. Fallback

- [x] 4.1 No-server / no-capability → an honest "unsupported" message rather than
      a silent empty panel. (Deeper: re-run at a node to re-root; references-based
      heuristic fallback deferred.)

## 5. i18n + verify

- [x] 5.1 EN + IT (`hier.*`).
- [x] 5.2 typecheck + cargo check + build green.
