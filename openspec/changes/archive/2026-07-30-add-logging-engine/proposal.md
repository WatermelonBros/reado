## Why

When a user hits a bug in Reado today there is no record of what happened — the Rust backend prints a couple of stray `println!`/`eprintln!` lines and the frontend logs nothing at all (`console.*` count in `src/` is 0). We cannot ask a user to "send us the logs" because there are none. A rich, on-disk logging engine lets users reproduce, capture, and ship a diagnostic file back to us, and lets them inspect what the app did on their own machine.

## What Changes

- Add a structured logging engine spanning both the Rust backend and the TS frontend, writing to a single rolling log file under the app's standard log directory.
- Backend: instrument every Tauri command (invoke entry/exit, duration, error), filesystem/git/pty/lsp/anywhere subsystems, and app lifecycle (startup, window events, exit). Replace the stray `println!`/`eprintln!` with structured records.
- Frontend: a logger module that captures app events, IPC calls (via a wrapped `invoke`), unhandled errors/promise rejections, and forwards records to the backend file sink through a dedicated command.
- Beyond the mechanical command/subsystem tracing, add **curated, high-signal log points** at the events we actually need when debugging a report: git mutations and network failures, Anywhere pairing/auth/connection events, PTY and LSP process lifecycle and crashes, filesystem mutations, watcher re-anchoring, index rebuilds, and frontend events like updates, settings sync, extension load, and terminal lifecycle.
- Log records are structured (timestamp, level, target/module, message, key-value fields) and serialised as line-delimited JSON, with a human-readable rendering for inspection.
- Configurable level (error/warn/info/debug/trace) and on/off, persisted via `tauri-plugin-store`; defaults to `info`.
- Size-based rolling with a bounded number of retained files so the log never grows without limit.
- Redaction of sensitive values (pairing tokens, absolute paths optionally, file contents) so a shared log is safe.
- A user-facing action to reveal/open the current log file and to copy its path, so users can attach it to a bug report.

## Capabilities

### New Capabilities
- `logging-engine`: The core structured logging facility — record schema, levels, the on-disk file sink, rolling/retention, redaction, and configuration.
- `backend-instrumentation`: What the Rust backend logs — command lifecycle, subsystem events, app lifecycle, and the command that receives frontend records.
- `frontend-instrumentation`: What the TS frontend logs — the logger module, the wrapped IPC boundary, global error capture, and forwarding to the backend sink.
- `log-access`: User-facing access to logs — reveal/open the log file, copy its path, and view the configured location.

### Modified Capabilities
<!-- No existing specs; nothing to modify. -->

## Impact

- **Rust**: new `log.rs` module; new deps (a logging facade + file/rolling sink, e.g. `tracing` + `tracing-subscriber` + `tracing-appender`, or `log` + `tauri-plugin-log`); wiring in `lib.rs` setup, `on_window_event`, and `run` exit; light touches across `fs.rs`, `git.rs`, `pty.rs`, `lsp.rs`, `anywhere.rs`; a new `log_record`/`log_reveal` command set.
- **TypeScript**: new `src/lib/logger.ts`; a wrapped `invoke` (or instrumentation in `src/lib/api.ts`); global handlers registered in `src/main.tsx`; settings UI hook for level/enable and a reveal-log action in the menu (`appMenu.ts`/`menu.ts`).
- **Config/store**: new persisted keys for log level and enabled flag.
- **Filesystem**: log files written under the OS app-log directory (e.g. `~/.local/share/<id>/logs` / `Library/Logs` / `%APPDATA%`); must be covered by Tauri capability permissions.
- **Privacy**: redaction policy applies before anything is written; document what is and isn't captured.
