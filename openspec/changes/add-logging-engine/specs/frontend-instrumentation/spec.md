## ADDED Requirements

### Requirement: Frontend logger module
The frontend SHALL provide a single logger module exposing level-named methods (`error`, `warn`, `info`, `debug`, `trace`) that accept a message and optional structured fields, and that forward records to the backend file sink. The module SHALL be the one place the rest of the frontend imports for logging.

#### Scenario: Logger forwards to backend
- **WHEN** application code calls a logger method
- **THEN** a record is sent to the backend log-record command for persistence

#### Scenario: Logging is non-blocking and safe
- **WHEN** forwarding a record to the backend fails
- **THEN** the calling code is unaffected and no exception propagates

### Requirement: Instrumented IPC boundary
The frontend SHALL log every IPC call made through the typed API layer: the command name, a redacted argument summary, success/failure, and elapsed time. This SHALL be implemented at the shared boundary (a wrapped `invoke`) so individual call sites need no changes.

#### Scenario: IPC call is traced
- **WHEN** the frontend invokes any backend command via the typed API
- **THEN** a record capturing the command name and duration is logged
- **AND** on failure the error is logged at `error` level and still thrown to the caller

#### Scenario: No recursive logging
- **WHEN** the logger forwards its own record via IPC
- **THEN** that forwarding call is not itself logged as an IPC event (no infinite recursion)

### Requirement: Global error capture
The frontend SHALL register global handlers for uncaught errors and unhandled promise rejections and SHALL log them at `error` level with stack information where available.

#### Scenario: Uncaught error
- **WHEN** an uncaught exception reaches the window error handler
- **THEN** an `error` record with the message and stack is logged

#### Scenario: Unhandled rejection
- **WHEN** a promise rejection goes unhandled
- **THEN** an `error` record describing the rejection reason is logged

### Requirement: Significant UI event logging
The frontend SHALL log significant user-facing events — project open/close, file open, and feature actions that touch persistence or external processes — at `info`/`debug` level so the log narrates what the user did.

#### Scenario: Project opened
- **WHEN** the user opens a project
- **THEN** an `info` record naming the action (with a redacted path) is logged

### Requirement: Curated frontend diagnostic checkpoints
The frontend SHALL emit hand-placed records at the subsystems most useful when diagnosing a report: the auto-updater, settings sync, the extension system, the integrated terminals, and the LSP client. Each checkpoint SHALL record the salient context and report failures at `error` level.

#### Scenario: Updater flow
- **WHEN** the updater checks for, finds, downloads, installs, or fails an update
- **THEN** a record captures the stage and the target version (and the error on failure)

#### Scenario: Settings sync and extensions
- **WHEN** settings are loaded/saved or an extension is loaded/enabled/disabled or fails to load
- **THEN** a record names the action and its outcome

#### Scenario: Terminal and LSP client lifecycle
- **WHEN** a terminal is opened/closed or fails to spawn, or the LSP client connects/disconnects or a request fails
- **THEN** a record captures the identifiers and the outcome
