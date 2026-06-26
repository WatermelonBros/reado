## ADDED Requirements

### Requirement: Command lifecycle logging
The backend SHALL log the lifecycle of every Tauri command: an entry record naming the command (and safe, redacted argument summary), and an exit record carrying outcome (ok/error) and elapsed duration in milliseconds. Errors returned across the command boundary SHALL be logged at `error` level with their message.

#### Scenario: Successful command
- **WHEN** a Tauri command completes successfully
- **THEN** an `info`/`debug` entry record and an exit record with `outcome=ok` and a duration are written

#### Scenario: Failing command
- **WHEN** a Tauri command returns an error
- **THEN** an `error` record is written naming the command and the error message
- **AND** the error is still returned to the frontend unchanged

#### Scenario: Argument redaction
- **WHEN** a command's arguments include file contents or secrets
- **THEN** the logged argument summary omits or redacts those values per the redaction policy

### Requirement: Subsystem event logging
The backend SHALL emit structured records from its long-running and side-effecting subsystems — filesystem operations, git operations, PTY spawn/kill, LSP start/stop, the filesystem watcher, and Reado Anywhere — covering significant state changes and failures.

#### Scenario: PTY lifecycle
- **WHEN** a PTY is spawned or killed
- **THEN** a record is written identifying the window and the action

#### Scenario: Anywhere replaces stray prints
- **WHEN** Reado Anywhere starts or fails to autostart
- **THEN** the event is emitted through the logging engine
- **AND** the previous `println!`/`eprintln!` calls in `anywhere.rs` are removed

### Requirement: App lifecycle logging
The backend SHALL log application lifecycle events: startup (with app version and resolved log path), window focus and close events, and exit (with the cleanup of PTYs, LSP servers, and Anywhere).

#### Scenario: Startup banner
- **WHEN** the app finishes setup
- **THEN** a startup record is written including the app version and the absolute log file path

#### Scenario: Exit cleanup
- **WHEN** the app exits
- **THEN** a record is written noting the shutdown and the subsystems being torn down

### Requirement: Curated diagnostic checkpoints
Beyond mechanical command-lifecycle tracing, the backend SHALL emit hand-placed, high-signal records at the points most useful when diagnosing a user report. These checkpoints SHALL carry the context needed to understand what happened (e.g. repo path, process id/window, language, counts, durations, and underlying error/stderr on failure), subject to the redaction policy.

#### Scenario: Git mutating operations
- **WHEN** a mutating git command runs (commit, checkout, stage/unstage, discard, stash, create-branch) or a network command runs (fetch, pull, push)
- **THEN** a record names the operation and repo and reports the outcome
- **AND** on failure the record includes the git error/stderr at `error` level

#### Scenario: Anywhere pairing and authentication
- **WHEN** Reado Anywhere mints/regenerates a session token, binds its listener, generates a certificate, accepts or rejects a client credential, or a client connects/disconnects
- **THEN** a record describes the event (token and TLS material redacted) including the bound address/port and certificate fingerprint

#### Scenario: Process lifecycle and crashes
- **WHEN** a PTY or LSP process is spawned, exits unexpectedly, or fails to start (e.g. binary not installed)
- **THEN** a record captures the language/shell, identifiers, and exit code or failure reason

#### Scenario: Filesystem, watcher, and index events
- **WHEN** a file is written/created/moved/imported, the watcher re-anchors a file on an external edit, or the comment index is rebuilt
- **THEN** a record captures the action, affected path(s) (redacted), and any counts/duration

### Requirement: Frontend record ingestion command
The backend SHALL expose a Tauri command that accepts log records originating in the frontend and writes them through the same file sink, so backend and frontend logs interleave in one file. The command SHALL validate and clamp the incoming level and SHALL apply redaction to forwarded fields.

#### Scenario: Frontend record is persisted
- **WHEN** the frontend invokes the log-record command with a valid record
- **THEN** the record is written to the same active log file as backend records
- **AND** its `target` makes clear it originated in the frontend

#### Scenario: Invalid level is clamped
- **WHEN** the frontend sends an unrecognised level
- **THEN** the backend clamps it to a valid level rather than rejecting the record
