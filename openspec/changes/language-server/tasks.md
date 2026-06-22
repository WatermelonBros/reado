> Large, phased. Land the pipe + diagnostics + hover on one language first.

## 0. Spike

- [x] 0.1 Spike: spawn a server from Rust (`src/lsp.rs`), Content-Length framing, JSON-RPC bridged to the webview as `lsp-{id}` events; CodeMirror `LSPClient` owns the handshake. Transport confirmed by build; live `publishDiagnostics` pending a server install on this machine.

## 1. Server lifecycle (Rust)

- [x] 1.1 Config table (frontend `src/lib/lsp.ts` `SERVERS`): language → { command, args, exts }; defaults for TS/JS + Rust. Detect installed via spawn failure (graceful fall-back to `[]`). Solidity deferred to Phase 4.
- [x] 1.2 Spawn/track one server per (server, root) in `LspState`; pipe stdio; shut down with the app via `kill_all` on `RunEvent::Exit`. (Restart-on-crash not yet — reader thread exits on EOF; revisit in Phase 4.)
- [x] 1.3 Bridge: `lsp_start`/`lsp_send`/`lsp_stop` Tauri commands + `lsp-{id}` events; `Transport` in `lsp.ts`.

## 2. Editor client (Phase 1: diagnostics + hover)

- [x] 2.1 CodeMirror LSP client: `languageServerSupport` syncs didOpen/didChange/didClose for the active file (primary pane only).
- [x] 2.2 Diagnostics → CodeMirror lint markers (themed quiet in `app.css`).
- [x] 2.3 Hover → tooltip with the server's type/documentation (built-in to `languageServerSupport`).

## 3. Navigation (Phase 2)

- [ ] 3.1 Definition/References via the server when available; fall back to the index otherwise (shared entry points with existing Go to Definition / Find References / Peek).
- [ ] 3.2 Document symbols feed the Outline (and Workspace Symbols when present).

## 4. Breadth & write-side (later phases)

- [ ] 4.1 Enable Rust + Solidity via config; verify each.
- [ ] 4.2 Optional: completion, signature help, rename, code actions.

## 5. Verify

- [x] 5.1 Handshake proven against rust-analyzer (27 caps) + typescript-language-server (23 caps) using the same Content-Length framing as `lsp.rs`; clean fall-back by design when absent; no leaked processes via `kill_all`. (Visual render of hover/underlines in the live webview = user-confirmed.) NB: bundled macOS app gets a minimal PATH — server discovery from `~/.cargo/bin` / nvm needs a PATH fix before release (Phase 4).
- [x] 5.2 typecheck green; cargo builds clean in dev; frontend build green.
