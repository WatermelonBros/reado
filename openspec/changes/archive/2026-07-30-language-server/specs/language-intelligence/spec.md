## ADDED Requirements

### Requirement: Managed Language Servers
Reado SHALL run language servers as external processes managed by the backend,
started per (language, project) when a matching file opens, and SHALL degrade
gracefully when no server is installed.

#### Scenario: Server starts on open
- **WHEN** a file whose language has a configured, installed server is opened
- **THEN** the corresponding language server is started for that project and
  receives the document

#### Scenario: Missing server
- **WHEN** no server is configured/installed for the language
- **THEN** Reado falls back to its index-based navigation and shows no errors

#### Scenario: Crash recovery
- **WHEN** a language server crashes
- **THEN** Reado reports it quietly and can restart it without reopening the file

### Requirement: Hover Information
When a server is available, the editor SHALL show type and documentation for the
symbol under the pointer on hover.

#### Scenario: Hover a symbol
- **WHEN** the pointer rests on a symbol and a server is available
- **THEN** a hover shows the server's type/documentation for it

### Requirement: Diagnostics
The editor SHALL display server diagnostics (errors/warnings) inline with quiet,
theme-coloured markers.

#### Scenario: Show diagnostics
- **WHEN** the server reports diagnostics for the open file
- **THEN** they appear inline at their ranges with severity styling

### Requirement: Precise Definition And References
When a server is available, Go to Definition and Find References SHALL use the
server's semantic results instead of the approximate index.

#### Scenario: Precise references
- **WHEN** the user finds references for a symbol and a server is available
- **THEN** only true semantic references are returned (not textual homonyms)

#### Scenario: Fallback when unavailable
- **WHEN** no server is available for the file
- **THEN** Go to Definition / Find References use the existing index

### Requirement: Document Symbols Feed Outline
When a server is available, the Outline (and Workspace Symbols) SHALL use the
server's document symbols.

#### Scenario: Server-backed outline
- **WHEN** a server provides document symbols for the open file
- **THEN** the Outline reflects them (kinds, nesting) instead of the heuristic
