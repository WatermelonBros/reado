# document-formatting Specification

## Purpose
TBD - created by archiving change fix-document-formatting. Update Purpose after archive.
## Requirements
### Requirement: Project-declared formatter selection

Reado SHALL select a CLI formatter for a file only from **enabled formatter
extensions** whose declared evidence is satisfied by the open project. Evidence
is a configuration file the formatter owns, or the formatter named as a
dependency or configuration key in the project's package manifest. Where more
than one enabled extension serves a file type and more than one is detected,
Reado SHALL rank them by the manifests' declared preference. Where a language
has a single conventional formatter shipped with its toolchain, its manifest MAY
declare PATH presence as sufficient evidence. Reado SHALL NOT invoke a formatter
found only on the global PATH when its manifest requires project evidence.

A project-local binary SHALL continue to be preferred over a global one of the
same name.

#### Scenario: A Biome project uses Biome

- **WHEN** the project root has a Biome configuration file and the user formats
  a TypeScript file
- **THEN** Reado formats with the project's Biome

#### Scenario: A Prettier project is never formatted by a global Biome

- **WHEN** the project declares Prettier, does not declare Biome, and Biome is
  installed on the user's global PATH
- **THEN** Reado formats with Prettier and never invokes the global Biome

#### Scenario: A project declaring neither is left alone

- **WHEN** no enabled formatter extension's evidence is satisfied for the file's
  type
- **THEN** Reado makes no change and reports that the project declares no
  formatter for this file

#### Scenario: A disabled extension contributes nothing

- **WHEN** the user disables a formatter extension whose evidence this project
  satisfies
- **THEN** Reado stops selecting it, and falls to the next detected formatter or
  to none

#### Scenario: Toolchain formatters still resolve on PATH

- **WHEN** the user formats a Rust or Go file and the toolchain's formatter is
  installed
- **THEN** Reado formats with it, because its manifest declares PATH presence as
  sufficient evidence

### Requirement: Language server formatting takes precedence

When a language server is running for the active file and its capabilities
advertise document formatting, Reado SHALL format through the server's
`textDocument/formatting` request in preference to any CLI formatter. When the
server declines, errors, or advertises no formatting capability, Reado SHALL
fall through to CLI selection rather than reporting a failure.

#### Scenario: The server formats

- **WHEN** a server is running for the file and advertises document formatting
- **THEN** Reado applies the edits the server returns, and no CLI formatter is
  spawned

#### Scenario: The server cannot format

- **WHEN** the running server advertises no formatting capability
- **THEN** Reado falls through to the project-declared CLI formatter without
  surfacing an error

#### Scenario: No server is running

- **WHEN** no language server is running for the file
- **THEN** Reado uses the project-declared CLI formatter

### Requirement: Format on save

Reado SHALL offer a **Format on save** editor setting, default off, persisted
with the other editor settings. When enabled, saving the active document SHALL
format it before writing, and the existing save hygiene (trim trailing
whitespace, insert final newline) SHALL be applied to the formatted text so the
two never fight.

#### Scenario: Enabled, the buffer is formatted on save

- **WHEN** Format on save is enabled and the user saves a file whose project
  declares a formatter
- **THEN** the text written to disk, and the text in the buffer, are the
  formatted text

#### Scenario: Disabled by default

- **WHEN** the user has never touched the setting and saves a file
- **THEN** the file is written unformatted, exactly as today

#### Scenario: Read-only buffers are never formatted

- **WHEN** the active buffer is pinned to a git ref for review
- **THEN** neither saving nor format on save alters or writes it

### Requirement: Format on save never costs the user their save

A failing, missing, or slow formatter SHALL NOT prevent the file from being
written. If formatting fails or exceeds a bounded time budget, Reado SHALL save
the unformatted buffer and surface the formatter's own reason non-modally.
Formatting SHALL be skipped when the buffer changed while the formatter was
running, so a save never clobbers edits the user made in the meantime.

#### Scenario: The formatter fails

- **WHEN** Format on save is enabled and the formatter exits with an error
  (e.g. the file does not parse)
- **THEN** the unformatted buffer is saved and the formatter's message is shown
  without blocking the editor

#### Scenario: The formatter hangs

- **WHEN** the formatter does not answer within the time budget
- **THEN** Reado abandons the format, saves the unformatted buffer, and reports
  the timeout

#### Scenario: The user typed while formatting ran

- **WHEN** the buffer changes between the format request and its result
- **THEN** the stale formatted text is discarded rather than applied

### Requirement: The chosen formatter is inspectable

A format result SHALL identify which formatter produced it, and SHALL
distinguish "no formatter is declared for this file" from "the formatter ran
and the file was already formatted". Manual Format Document SHALL report both
outcomes to the user rather than appearing to do nothing.

#### Scenario: Nothing to change

- **WHEN** the user formats an already-formatted file
- **THEN** Reado reports that the file is already formatted, naming the
  formatter that checked it

#### Scenario: Nothing available

- **WHEN** the user formats a file whose project declares no formatter
- **THEN** Reado says so, rather than failing silently or reporting an error
  that looks like a crash

### Requirement: Per-project formatter override

Reado SHALL let the user override formatter selection for the open project: pin
a specific enabled formatter extension for a file type, or disable formatting
for that file type in that project. The override SHALL take precedence over
detection and over language-server formatting, SHALL be stored per project, and
SHALL NOT affect other projects.

#### Scenario: Pinning a formatter

- **WHEN** the user pins Prettier for TypeScript in a project that also declares
  Biome
- **THEN** Reado formats TypeScript with Prettier in that project, and continues
  to use each other project's own detection

#### Scenario: Turning formatting off for a project

- **WHEN** the user disables formatting for a file type in a project
- **THEN** neither Format Document nor format on save alters those files, and
  Format Document says formatting is disabled for this project

#### Scenario: The override outranks the language server

- **WHEN** a formatter is pinned for a file type and a running language server
  also advertises document formatting
- **THEN** Reado uses the pinned formatter

