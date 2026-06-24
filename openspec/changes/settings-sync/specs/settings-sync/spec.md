## ADDED Requirements

### Requirement: Portable settings bundle

Reado SHALL export the user's machine-portable configuration to a single
versioned JSON bundle that carries a stable `kind` marker, a schema version, the
exporting Reado version, an export timestamp, and a `data` block holding global
settings, the enabled/disabled extension and language-server state, and a
reserved keymap section. The bundle SHALL contain only preferences that are
meaningful on any machine.

#### Scenario: Export produces a versioned bundle

- **WHEN** the user triggers "Export settings…"
- **THEN** Reado writes a JSON file whose `kind` is the Reado settings-bundle
  marker, with a schema version, the app version, an export timestamp, and the
  user's current settings and enabled/disabled extensions

#### Scenario: Bundle reflects current preferences

- **WHEN** the user has chosen a theme, toggled reading aids, and disabled one
  language-server extension, then exports
- **THEN** the bundle records that theme, those reading aids, and that disabled
  extension

### Requirement: Import and apply a bundle

Reado SHALL import a settings bundle from a file, present a plain summary of what
will change, and on explicit confirmation apply the bundle's settings and
extension state into the running app, where the existing per-machine persistence
propagates them to other open windows. Import SHALL be an explicit user action
and SHALL never run on its own.

#### Scenario: Importing applies preferences

- **WHEN** the user imports a valid bundle and confirms
- **THEN** Reado applies its settings and enabled/disabled extension state, and
  the change is reflected in the current and other open windows on that machine

#### Scenario: Import is confirmed before applying

- **WHEN** the user selects a bundle file to import
- **THEN** Reado shows a summary of what will change and applies nothing until
  the user confirms

### Requirement: Explicit scope — no secrets, no project-local state

The bundle SHALL include only cross-machine preferences and SHALL NOT include
secrets or project-local state — specifically not per-project `.reado/` data,
recent projects, restored tab sessions, window/branch layout, or any absolute
filesystem paths. The Settings UI SHALL state plainly what does and does not
sync.

#### Scenario: Project-local state is excluded

- **WHEN** the user exports a bundle while a project is open with recent
  projects and an active session
- **THEN** the bundle contains no recent-project list, no session/tab state, no
  `.reado/` contents, and no absolute paths

#### Scenario: No secrets are carried

- **WHEN** a bundle is exported
- **THEN** it contains no credentials, tokens, or other secret material

#### Scenario: Scope is disclosed

- **WHEN** the user views the sync section in Settings
- **THEN** Reado states which preferences sync and that project-local state and
  secrets do not

### Requirement: Validation and version compatibility

Reado SHALL validate an imported bundle before applying it: it SHALL reject input
that is not a well-formed Reado settings bundle with a clear message, SHALL
refuse to apply a bundle whose schema version is newer than this build
understands rather than applying it partially, and SHALL ignore unknown
forward-compatible fields so older bundles still import.

#### Scenario: Malformed input is rejected

- **WHEN** the user imports a file that is not valid JSON or lacks the Reado
  settings-bundle `kind`
- **THEN** Reado rejects it with a clear error and changes nothing

#### Scenario: Newer schema is refused, not half-applied

- **WHEN** a bundle declares a schema version newer than this build supports
- **THEN** Reado declines to apply it and tells the user to update, rather than
  applying part of it

#### Scenario: Unknown fields are tolerated

- **WHEN** a valid bundle contains extra fields this build does not recognise
- **THEN** Reado imports the recognised preferences and ignores the rest without
  error
