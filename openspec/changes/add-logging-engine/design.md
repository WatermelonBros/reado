## Context

Reado is a Tauri 2 desktop app: a thin Rust backend (`src-tauri/src/*.rs`) exposing ~70 commands over the IPC boundary, and a React 19 + TS frontend that owns the experience. Persistence (recents, settings, sessions) lives in the frontend via `tauri-plugin-store`. Today there is effectively no logging: two stray `println!`/`eprintln!` lines in `anywhere.rs` and zero `console.*` calls in `src/`. When a user reports a bug we have nothing to inspect.

This change adds one logging engine shared by both sides, writing a single rolling, line-delimited-JSON file in the OS app-log directory, plus user-facing actions to reveal/copy it. It is cross-cutting (every command, both runtimes), adds a new dependency, has a privacy/redaction dimension, and benefits from deciding the architecture before coding — hence this design.

## Goals / Non-Goals

**Goals:**
- One unified log file with interleaved backend + frontend records, machine-parseable (JSONL) and greppable.
- Capture command lifecycle, subsystem events, app lifecycle, IPC calls, and global frontend errors.
- Bounded on-disk footprint (size-based rolling + retention cap).
- Redaction so a user can safely send us the file.
- Configurable level + on/off, persisted, with a one-click way to find the file.
- Logging failures never affect app behavior.

**Non-Goals:**
- No remote/telemetry upload — the user manually attaches the file. (Leaves the door open later.)
- No log viewer UI inside the app beyond reveal/copy-path (inspection happens in an external editor).
- No structured log querying/indexing.
- No capture of full file contents or terminal byte streams (privacy + volume).
- No per-module dynamic level routing in v1 (single global threshold).

## Decisions

### Decision: `tracing` + `tracing-subscriber` + `tracing-appender` for the Rust sink
Use the `tracing` ecosystem as the backend logging facade and sink rather than `log` + `tauri-plugin-log` or a hand-rolled writer.

- **Why**: `tracing` gives structured fields and spans natively (ideal for command entry/exit + duration via `#[instrument]` or manual spans). `tracing-appender` provides non-blocking writes and rolling out of the box. A `Layer` lets us emit JSONL and apply redaction in one place.
- **Alternatives considered**:
  - `tauri-plugin-log`: simplest integration and has a frontend bridge, but its record model is line-oriented strings, not structured fields, and rolling/redaction customization is limited. Rejected for the "rich" requirement.
  - `log` + `env_logger`/`fern`: lighter, but no spans, weaker structured-field story.
  - Hand-rolled: full control but we'd reimplement rolling, non-blocking IO, and formatting — not worth it.
- **Note**: `tracing-appender` rolls by time/count; size-based rolling is the explicit requirement. We implement a thin size-aware writer (or a custom `MakeWriter`) wrapping the appender, OR adopt a size-rolling crate. Resolve in Open Questions.

### Decision: Single shared file, JSONL, written only by the backend
The backend owns the file. The frontend never touches the filesystem directly; it forwards records through a `log_record` Tauri command.

- **Why**: one writer = no cross-process file contention; interleaving is natural; redaction is enforced server-side even for frontend-originated fields; the frontend stays sandboxed.
- **Alternatives**: frontend writing its own file via fs plugin (two files to collect, two redaction paths, capability surface area) — rejected.

### Decision: Record schema
`{ "ts": "<iso8601-ms-utc>", "level": "info", "target": "reado::git" | "ui:ipc", "msg": "...", "fields": { ... } }`. Frontend records use a `ui:` target prefix so origin is obvious. This is the contract for both runtimes and for any parser we write later.

### Decision: Redaction at the sink, centrally
A single redaction step runs in the backend before write, for both backend and frontend records. It (a) drops/!len-replaces known content-bearing fields (file `content`, `text`), (b) masks Anywhere tokens/TLS material, (c) optionally shortens absolute paths to a project-relative or home-relative form.

- **Why**: one chokepoint is auditable; frontend can't bypass it. Field-name allowlist/denylist is the mechanism.
- **Trade-off**: relies on consistent field naming; documented in the spec and enforced by code review.

### Decision: IPC instrumentation via a wrapped `invoke`
Add a single `tracedInvoke` wrapper used by `src/lib/api.ts` instead of calling `@tauri-apps/api/core` `invoke` directly. The logger's own forwarding call bypasses the wrapper (calls raw `invoke`) to avoid recursion.

- **Why**: ~70 call sites already funnel through `api.ts`; wrapping once instruments them all with no per-call changes.
- **Alternative**: instrument each command — rejected (churn, drift).

### Decision: Configuration via `tauri-plugin-store`
Reuse the existing store for `log.enabled` (default true) and `log.level` (default `info`). On startup the backend reads these to set the threshold; runtime changes update an atomic level handle (e.g. `tracing_subscriber::reload` or an `AtomicU8` checked by a filter `Layer`).

- **Why**: consistent with how the app already persists settings; no new mechanism.

### Decision: Access actions reuse existing capabilities
Reveal uses `tauri-plugin-opener` (already a dependency). A `log_path` command returns the resolved path for "copy path" and the settings display.

## Risks / Trade-offs

- **Log volume from IPC tracing floods the file** → keep IPC entry at `debug`, exit-summary at `debug`, only errors at `error`; default threshold `info` means IPC is quiet unless a user opts into `debug` for a repro.
- **Redaction misses a new sensitive field** → denylist by field name plus a documented convention; review checklist item; default-omit large/binary fields.
- **Size-based rolling not native to `tracing-appender`** → wrap with a size-checking writer or pull a small rolling crate; verify retention deletes oldest. (Open question below.)
- **Non-blocking appender drops records on shutdown** → keep the `WorkerGuard` alive for the process lifetime and flush on the `RunEvent::Exit` path before subsystem teardown.
- **Frontend→backend forwarding adds IPC overhead per log** → batch/debounce frontend records if volume is high; v1 sends per-record at `info`+ which is low-rate. Revisit if `debug` is noisy.
- **Recursion: logging an IPC call that is itself the log_record call** → logger forwards via raw `invoke`, and `log_record` is excluded from command-lifecycle tracing.
- **Capabilities**: writing under the log dir and revealing it must be permitted in `src-tauri/capabilities/`; missing permission = silent no-op. Add and verify.

## Migration Plan

Additive, no data migration. Rollout:
1. Land backend engine (`log.rs`) + deps + lifecycle wiring; verify file appears and rolls.
2. Add `log_record` + `log_path` commands and capability entries.
3. Wrap `invoke` in `api.ts`; add `logger.ts`; register global handlers in `main.tsx`.
4. Replace `anywhere.rs` stray prints.
5. Add settings controls + menu reveal/copy actions.

Rollback: feature is gated by `log.enabled`; setting it false (or reverting the commits) disables writes. No persisted schema to unwind.

## Open Questions

- Size-rolling implementation: extend `tracing-appender` with a size-aware `MakeWriter`, or add a dedicated size-rolling crate? Decide during task 1 based on crate maturity.
- Default caps: proposed 5 MB per file, 5 archived files (≈25 MB ceiling) — confirm acceptable.
- Should absolute-path redaction be on by default, or opt-in? Default to home-relative shortening (keeps logs useful while reducing PII).
- Do we want a `trace`-level capture of PTY/LSP byte streams behind an explicit opt-in for deep debugging, or never? (Currently Non-Goal.)

## Implementation Notes (as built)

Two decisions changed during implementation; recorded here so the design matches the code:

- **Self-contained sink instead of the `tracing` stack.** `tracing-appender` rolls by time, not size, and bending it to a size-aware `MakeWriter` was more fragile than owning the writer. `src-tauri/src/log.rs` is a hand-rolled sink: a global `OnceLock<Logger>` with an `AtomicU8` threshold + `AtomicBool` enable, a `Mutex<Sink>` holding the file handle, numbered size-rolling (`reado.log` → `reado.log.1` … up to 5 archives, 5 MB each), central redaction, and per-write flush (no `WorkerGuard`). Only `chrono` was added (already in the tree). This resolves the size-rolling open question and keeps the dependency footprint flat.
- **Config owned by the frontend, not read from `tauri-plugin-store` in Rust.** Settings persist to `localStorage` via zustand `persist`, which Rust can't read. So the backend starts at `info`/enabled and the frontend pushes the persisted `logEnabled`/`logLevel` via the `log_set_config` command on boot and on change (`App.tsx`).
- **No backend per-command middleware.** Tauri 2 has no global command interceptor; the frontend `tracedInvoke` wrapper logs every command's name/duration/outcome at the IPC boundary (arg *keys* only, never values), and curated per-subsystem logs cover backend-side detail.
- **Caps confirmed**: 5 MB × 5 files (~25 MB ceiling). **Path redaction**: home-relative shortening on by default; secret/content field names are dropped or length-summarised before write.
- **Verbosity is intentional for the development phase.** The instrumentation is deliberately loud (most subsystems at `info`/`debug`, every IPC call traced) so we have a rich trail to debug from while building. This is more than a shipped product should write by default. `TODO(dev-phase)` markers in `log.rs` and `logger.ts` flag the follow-up: before a stable release, lower the default level, demote chatty events (IPC tracing, watcher, search) to `trace`, and consider sampling high-frequency targets.
