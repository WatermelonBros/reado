## MODIFIED Requirements

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

## ADDED Requirements

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
