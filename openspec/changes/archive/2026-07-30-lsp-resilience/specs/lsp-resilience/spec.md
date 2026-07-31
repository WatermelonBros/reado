## ADDED Requirements

### Requirement: Capture server stderr

Reado SHALL capture each language server's standard error and record it to the
diagnostic log (line by line, truncated to a sane length, honouring the log's
redaction), instead of discarding it. This SHALL NOT block the server's normal
stdout processing.

#### Scenario: A server logs a startup error

- **WHEN** a language server writes an error to stderr (e.g. a missing dependency)
- **THEN** that output appears in Reado's log file, attributed to the LSP scope,
  rather than being lost

#### Scenario: Chatty stderr doesn't stall the pipe

- **WHEN** a server writes a large volume to stderr
- **THEN** stdout messages continue to be processed and forwarded normally

### Requirement: Detect and signal server exit

Reado SHALL emit a per-connection exit signal when a language server's output
stream ends (the process has gone), so the frontend can react rather than
continuing to use a dead connection.

#### Scenario: Server process dies

- **WHEN** a running language server exits or crashes
- **THEN** the backend emits an exit event for that connection id

### Requirement: Recover from a crashed server

On a server exit that the frontend did not initiate, Reado SHALL drop the cached
connection so the next file interaction reconnects a fresh server (whose republished
diagnostics then supersede the stale ones), and surface exactly one calm notice per
connection telling the user the language server stopped. An intentional stop (page
hide, HMR dispose, explicit stop) SHALL NOT raise that notice.

#### Scenario: Crash surfaces once and reconnects lazily

- **WHEN** a language server crashes while a file of that language is open
- **THEN** the user sees one notice that the server stopped, the dead connection
  is discarded, and interacting with a file of that language starts a fresh server

#### Scenario: Flapping server doesn't spam

- **WHEN** the same server exits repeatedly
- **THEN** the crash notice is not shown more than once per connection until it is
  successfully reconnected

#### Scenario: Intentional stop is quiet

- **WHEN** the page is hidden, the module hot-reloads, or the server is stopped on
  purpose
- **THEN** no crash notice is shown
