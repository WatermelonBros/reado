## ADDED Requirements

### Requirement: Structured log records
The system SHALL produce log records that each carry a timestamp (UTC, millisecond precision), a severity level, a target identifying the originating module/subsystem, a human-readable message, and an optional set of structured key-value fields. Records SHALL be persisted as line-delimited JSON (one JSON object per line) so they are both machine-parseable and greppable.

#### Scenario: Record contains required fields
- **WHEN** any subsystem emits a log record
- **THEN** the written line is a valid JSON object containing `ts`, `level`, `target`, and `msg` keys
- **AND** any structured fields supplied by the caller appear under a `fields` object

#### Scenario: One record per line
- **WHEN** multiple records are written in sequence
- **THEN** each record occupies exactly one line terminated by a newline
- **AND** a malformed or multi-line message is escaped so it never breaks line framing

### Requirement: Severity levels
The system SHALL support the levels `error`, `warn`, `info`, `debug`, and `trace` in decreasing severity, and SHALL only persist records whose level is at or above the configured threshold.

#### Scenario: Level filtering
- **WHEN** the configured threshold is `info`
- **THEN** `error`, `warn`, and `info` records are written
- **AND** `debug` and `trace` records are discarded before reaching the file

#### Scenario: Default level
- **WHEN** no level has been configured by the user
- **THEN** the threshold defaults to `info`

### Requirement: File sink in the OS log directory
The system SHALL write logs to a file inside the operating system's standard per-app log directory, resolved via the Tauri path API, creating the directory if absent. The active log file SHALL have a stable, documented name so users can locate it.

#### Scenario: Log directory is created
- **WHEN** the app starts and the log directory does not yet exist
- **THEN** the directory is created before the first record is written
- **AND** the resolved absolute path is recorded in the first startup log line

#### Scenario: Cross-platform location
- **WHEN** the app runs on Linux, macOS, or Windows
- **THEN** the log file resides under that platform's conventional app-log location

### Requirement: Size-based rolling and retention
The system SHALL roll the active log file to an archived file when it exceeds a bounded size, and SHALL retain only a bounded number of archived files, deleting the oldest beyond the limit so total log storage stays bounded.

#### Scenario: Roll on size limit
- **WHEN** the active log file would exceed the configured maximum size
- **THEN** it is rotated to an archived name and a fresh active file is started

#### Scenario: Retention cap
- **WHEN** the number of archived log files exceeds the retention limit
- **THEN** the oldest archived files are deleted until the count is within the limit

### Requirement: Redaction of sensitive values
The system SHALL redact sensitive values before they are written to disk, so a shared log file does not leak secrets. At minimum, pairing tokens and certificate material from Reado Anywhere, and file contents passed through commands, SHALL never appear verbatim.

#### Scenario: Token never written
- **WHEN** a record would include a Reado Anywhere pairing token or TLS key
- **THEN** the value is replaced with a redaction placeholder in the written line

#### Scenario: File contents not logged
- **WHEN** a command that carries file contents (e.g. read/write) is logged
- **THEN** the content payload is omitted or replaced by its byte length, never written verbatim

### Requirement: Configurable enable/disable and level
The system SHALL expose configuration for whether logging is enabled and at which level, persisted across restarts via the app store, and applied without requiring a rebuild.

#### Scenario: Disable logging
- **WHEN** the user disables logging
- **THEN** no further records are written to the file until it is re-enabled

#### Scenario: Persisted across restart
- **WHEN** the user sets the level to `debug` and restarts the app
- **THEN** the threshold is `debug` on the next launch

### Requirement: Logging never crashes the app
The logging engine SHALL be resilient: a failure to write, rotate, or serialise a record MUST NOT propagate as an error to the caller or crash the application.

#### Scenario: Write failure is swallowed
- **WHEN** the log file cannot be written (e.g. disk full or permission denied)
- **THEN** the originating operation continues unaffected
- **AND** the failure does not raise an exception across the command boundary
