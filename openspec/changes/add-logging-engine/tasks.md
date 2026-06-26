## 1. Backend logging engine

- [x] 1.1 Add deps to `src-tauri/Cargo.toml` — DEVIATION: self-contained sink instead of `tracing` stack (full control of size-rolling/redaction; see design.md); added `chrono` only (already in tree)
- [x] 1.2 Create `src-tauri/src/log.rs` with the record schema (`ts`, `level`, `target`, `msg`, `fields`) serialised as JSONL
- [x] 1.3 Resolve the OS app-log directory via the Tauri path API, create it if absent, and define the stable active-file name (`reado.log`)
- [x] 1.4 Implement size-based rolling (5 MB) and retention (5 archives, oldest deleted)
- [x] 1.5 Implement the central redaction step (secret/content field denylist; home-relative path shortening) applied before write
- [x] 1.6 Implement a global level threshold backed by an `AtomicU8` (+ `AtomicBool` enable), defaulting to `info`
- [x] 1.7 Ensure all write/rotate/serialise failures are swallowed — DEVIATION: no `WorkerGuard` (self-contained sink flushes per write under a mutex)
- [x] 1.8 Expose `init(log_dir, home) -> path`; call from `lib.rs` `setup()` before other init

## 2. Backend instrumentation

- [~] 2.1 Command lifecycle — DEVIATION: Tauri 2 has no global command middleware; the frontend `tracedInvoke` (4.2) logs every command's name/args/duration/outcome at the IPC boundary, so backend per-command tracing is covered there; curated per-subsystem logs cover the rest (group 6)
- [x] 2.2 Add subsystem records: `fs`, `git`, `pty` (spawn/kill + window), `lsp` (start/stop), `watcher`, `anywhere`
- [x] 2.3 Replace the `eprintln!` in `anywhere.rs` with a log call; the env-gated dev URL `println!` is kept as intentional dev-only stdout (token never logged) and now also emits a redacted log line
- [x] 2.4 Add app-lifecycle records: startup banner (app version + absolute log path), window focus/close events, exit/teardown
- [x] 2.5 Add `log_record` command: validate+clamp level, apply redaction, write frontend records to the shared sink with a `ui:` target
- [x] 2.6 Add `log_path` command returning the resolved active-file absolute path
- [x] 2.7 Register `log_record`/`log_path`/`log_set_config` in the `invoke_handler!` list in `lib.rs`

## 3. Configuration & capabilities

- [x] 3.1 Startup config — DEVIATION: settings live in `localStorage` (zustand persist), not `tauri-plugin-store`; backend starts at default `info`/enabled and the frontend pushes the persisted choice via `log_set_config` on boot
- [x] 3.2 Apply runtime changes to enable/disable and level without restart (`log_set_config` → `AtomicU8`/`AtomicBool`)
- [x] 3.3 Added `opener:allow-reveal-item-in-dir` to `capabilities/default.json` (log dir lives under the OS app-log dir resolved by the path API — no extra fs permission needed since the backend owns the writer)

## 4. Frontend logging

- [x] 4.1 Create `src/lib/logger.ts` (`createLogger(target)` + default `log`); forwards to `log_record` via raw `invoke`; local enable/level gate; failures swallowed
- [x] 4.2 `tracedInvoke` wrapper; `src/lib/api.ts` imports it as `invoke`; logs command name + arg *keys* (never values) + duration + outcome; `log_*` excluded
- [x] 4.3 Global `error` and `unhandledrejection` handlers in `src/main.tsx` at `error` level with stack
- [x] 4.4 Project open/close logged in `App.tsx` (file open captured via the auto-traced `read_file` IPC)

## 5. Log access UX

- [x] 5.1 "Reveal Log File" in Help menu (JS title bar + native macOS menu), via `revealItemInDir`
- [x] 5.2 "Copy Log Path" action copying `log_path` to the clipboard
- [x] 5.3 Logging settings UI in `Settings.tsx`: enable toggle, level selector, resolved path + reveal/copy buttons

## 6. Curated backend checkpoints

- [x] 6.1 `git.rs`: instrumented the `run_git_checked` funnel (covers commit/checkout/create_branch/stage/unstage/discard/stash + fetch/pull/push) with args+outcome; stderr on failure at `error`
- [x] 6.2 `anywhere.rs`: server bind addr + cert fingerprint (redacted), client auth rejected, terminal ws connect/disconnect, dev autostart
- [x] 6.3 `pty.rs`: spawn (cwd, window, pid) + spawn failure, kill, child exit
- [x] 6.4 `lsp.rs`: server start, not-installed warning, start failure, stop, exit
- [x] 6.5 `fs.rs`: write/create/move/import with redacted path(s) and counts; write failure with path + error
- [x] 6.6 `watcher.rs`: start-watching root, each file-changed reanchor trigger, watch errors
- [x] 6.7 `index.rs` rebuild count+duration; `format.rs` formatter + success/failure; `search.rs` query + match/replace counts; `cli.rs` install path
- [x] 6.8 `annotations.rs`: comment create/delete/state-change/reanchor (id) and project-config write failure

## 7. Curated frontend checkpoints

- [x] 7.1 `updater.ts`/`update.ts`: check, up-to-date, update-available (version), download/install, failures
- [x] 7.2 `settingsSync.ts`: import/export; `extensions.ts`: enable/disable (declarative manifests have no load step, so no load-failure path)
- [x] 7.3 `terminals.ts`: open/close (PTY spawn failures captured at the auto-traced `pty_spawn` IPC + backend `pty` logs)
- [x] 7.4 `lsp.ts`: client connect + connect-failure; disconnect on HMR teardown (per-request failures are intentionally swallowed/best-effort by design)

## 8. Verification

- [x] 8.1 Rust unit tests: redaction (tokens/contents/paths), JSONL single-line framing, level clamping (`log.rs` tests, all green)
- [x] 8.2 VERIFIED live: file created at `~/.local/share/com.reado.app/logs/reado.log`; backend (`app`) + frontend (`ui:updater`) records interleave; home-path redaction applied. (Size roll/retention covered by code + reasoning, not exercised at 5 MB.)
- [~] 8.3 MANUAL (un-triggered): disabled session writes nothing; `debug` persists across restart. Gate logic verified by unit reasoning + the live level-gate (debug IPC suppressed at `info`); not exercised via the GUI toggle.
- [~] 8.4 PARTIAL: app-lifecycle curated records verified live (startup, `update check`, `window close requested`, `exit: tearing down subsystems` all written). The project-activity checkpoints (`watcher`/`index`/`git`/`fs`) were not triggered (no project opened during the run) but use the identical proven `crate::log::*` write path.
- [x] 8.5 `pnpm typecheck` ✓, `pnpm test` ✓ (14), `cargo build` ✓, `cargo clippy` ✓ (no issues), `cargo fmt --check` ✓, `cargo test` ✓ (22)
