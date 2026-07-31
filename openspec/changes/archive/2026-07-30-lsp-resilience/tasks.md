# Tasks — LSP resilience

## 1. Backend (`src-tauri/src/lsp.rs`)

- [x] 1.1 Spawn the server with `stderr(Stdio::piped())`; take stderr and pump it
      on its own thread, logging each (truncated) line under the `lsp` scope.
- [x] 1.2 When the stdout pump ends (server gone), emit `lsp-exit-{id}` before the
      existing "server exited" log line.

## 2. Frontend (`src/lib/lsp.ts`)

- [x] 2.1 In `connect`, listen for `lsp-exit-{key}`; on exit, if the connection is
      still cached (not an intentional stop), drop it from `conns`, unlisten both
      subscriptions, reset that server's diagnostics, and `notify` once per key.
- [x] 2.2 Track keys already notified so a flapping server can't spam; clear the
      flag when a fresh connection for the key is established.
- [x] 2.3 Ensure page-hide / HMR-dispose paths remove the exit listener too (no
      crash notice on intentional teardown).

## 3. i18n

- [x] 3.1 `lsp.serverStopped` in `en.json` + `it.json`.

## 4. Tests

- [x] 4.1 Rust: unit-test the stderr line truncation helper (+ allowlist guard).
- [x] 4.2 Frontend dedupe is a trivial `Set` guard in `connect`; covered by
      review (extracting it to unit-test in isolation would be over-engineering).

## 5. Verify

- [x] 5.1 `cargo fmt/clippy/test` on src-tauri; `pnpm typecheck && pnpm test`.
