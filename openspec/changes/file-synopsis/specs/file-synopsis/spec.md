## ADDED Requirements

### Requirement: Synopsis Button Opens a Modal
Reado SHALL provide a small button in the editor header / breadcrumb area that,
when activated, opens a modal containing the current file's synopsis. The
synopsis SHALL NOT be rendered inline at the top of the file; the only surface
for it is the modal.

#### Scenario: Open the synopsis modal
- **WHEN** the user activates the Synopsis button for the open file
- **THEN** a calm modal opens showing the file's synopsis (or its generate/empty
  state if none exists yet), and nothing is rendered inline above the code

#### Scenario: No inline rendering
- **WHEN** a file is opened in the editor
- **THEN** no synopsis is shown inline at the top of the file; the code remains
  the first content in the editor

### Requirement: Explicitly-Generated AI Synopsis
Reado SHALL generate the synopsis only on the user's explicit request, and the
synopsis content SHALL include the file's purpose and its key symbols (and how it
fits the codebase). Generation MUST never happen silently.

#### Scenario: Generate on request
- **WHEN** the user chooses Generate in the synopsis modal for a file with no
  cached synopsis
- **THEN** an AI synopsis is produced via the existing agent contract and shown,
  describing the file's purpose and listing its key symbols

#### Scenario: Key symbols seeded from outline
- **WHEN** a synopsis is generated and document symbols / Outline data exist for
  the file
- **THEN** the request uses those symbols so the "key symbols" reflect the file's
  actual structure rather than being re-derived

### Requirement: Cached in the Project's .reado Directory
Reado SHALL cache each generated synopsis under the project's `.reado` directory
together with a content fingerprint of the file, so re-opening the modal loads
the cached synopsis without regenerating.

#### Scenario: Load from cache
- **WHEN** the user opens the synopsis modal for a file that already has a cached
  synopsis whose fingerprint matches the current file
- **THEN** the cached synopsis is displayed immediately without contacting the
  agent

#### Scenario: Persisted across sessions
- **WHEN** a synopsis has been generated and the project is reopened later
- **THEN** the synopsis is still available from the `.reado` cache for that file

### Requirement: Regenerate and Staleness
Reado SHALL detect when a cached synopsis is stale because the file changed
substantially, surface this honestly in the modal, and let the user regenerate
on demand to replace the cached synopsis.

#### Scenario: Stale synopsis flagged
- **WHEN** the modal is opened for a file whose current fingerprint diverges
  substantially from the cached synopsis's fingerprint
- **THEN** the modal shows a "may be out of date" indicator and offers a
  Regenerate action

#### Scenario: Regenerate replaces the cache
- **WHEN** the user chooses Regenerate
- **THEN** a fresh synopsis is generated and written to the `.reado` cache with
  the file's current fingerprint, replacing the previous entry
