> Large, phased. Land the pipe + diagnostics + hover on one language first.

## 0. Spike

- [ ] 0.1 Spike: spawn `typescript-language-server --stdio` from Rust, complete the LSP handshake (initialize/initialized), open a doc, receive `publishDiagnostics`. Confirm the transport (Rust ↔ webview) and message framing.

## 1. Server lifecycle (Rust)

- [ ] 1.1 Config table: language → { command, args, fileTypes }; defaults for TS/JS, Rust, Solidity; detect installed (PATH) and degrade gracefully.
- [ ] 1.2 Spawn/track one server per (language, root); pipe stdio; restart on crash; shut down with the project (reuse the PTY process-group cleanup pattern).
- [ ] 1.3 Bridge: forward LSP JSON-RPC between the server and the frontend (Tauri commands + events), or expose a thin client API.

## 2. Editor client (Phase 1: diagnostics + hover)

- [ ] 2.1 CodeMirror LSP client: sync document changes (didOpen/didChange/didClose) for the active file.
- [ ] 2.2 Diagnostics → CodeMirror lint markers (quiet, themed).
- [ ] 2.3 Hover → tooltip with the server's type/documentation.

## 3. Navigation (Phase 2)

- [ ] 3.1 Definition/References via the server when available; fall back to the index otherwise (shared entry points with existing Go to Definition / Find References / Peek).
- [ ] 3.2 Document symbols feed the Outline (and Workspace Symbols when present).

## 4. Breadth & write-side (later phases)

- [ ] 4.1 Enable Rust + Solidity via config; verify each.
- [ ] 4.2 Optional: completion, signature help, rename, code actions.

## 5. Verify

- [ ] 5.1 Works with a server installed; clean fallback when absent; no leaked server processes on close.
- [ ] 5.2 typecheck + cargo check + build green.
