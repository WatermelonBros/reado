## ADDED Requirements

### Requirement: Exclude paths from tree and search

Reado SHALL let the user define a list of glob patterns whose matching files and
directories are hidden from the file tree and omitted from project search. The
exclusion SHALL be applied in the backend so excluded directories are not walked,
SHALL compose with (not replace) existing gitignore handling, and SHALL update
the tree live when changed.

#### Scenario: Excluded directory disappears from the tree

- **WHEN** the user adds `node_modules` to the exclude list
- **THEN** `node_modules` no longer appears in the file tree and its contents are
  not returned when listing, without restarting the app

#### Scenario: Excluded paths are absent from search

- **WHEN** an exclude pattern matches build output and the user runs a project
  search
- **THEN** no results come from the excluded paths

#### Scenario: Show-hidden still overrides

- **WHEN** the user has enabled "show hidden & ignored files"
- **THEN** the interaction between that override and the exclude list is
  well-defined and documented (excludes are user intent and remain applied unless
  the design explicitly states otherwise)

#### Scenario: Invalid pattern is ignored safely

- **WHEN** an exclude entry is empty or malformed
- **THEN** it is ignored without breaking listing or search, and valid entries
  still apply

### Requirement: Session restore is an explicit choice

Reado SHALL let the user choose whether reopening a project restores its saved
session — open tabs, active file, tree drill-down, and scroll/caret — or starts
at a clean workspace. The choice SHALL persist and SHALL NOT delete the stored
session when restore is turned off.

#### Scenario: Restore off starts clean

- **WHEN** session restore is off and the user reopens a project
- **THEN** no tabs are reopened and the workspace starts clean, while the
  previously saved session remains on disk

#### Scenario: Restore on returns to where you were

- **WHEN** session restore is on and the user reopens a project
- **THEN** the prior tabs, active file, drill-down, and scroll/caret are restored

### Requirement: Large-file safety mode

Reado SHALL let the user set a size threshold above which a file opens in a
plain, read-only, decoration-light mode rather than the full editor, with a
threshold of zero meaning the guard is off, and SHALL offer an explicit
"open anyway" to load the full editor for that file.

#### Scenario: Oversized file opens in safe mode

- **WHEN** the guard is set to 5 MB and the user opens an 80 MB minified file
- **THEN** the file opens in a plain read-only view (no heavy highlighting/LSP)
  and remains responsive, with an "open anyway" affordance

#### Scenario: Guard off loads everything

- **WHEN** the guard is set to zero
- **THEN** files open in the full editor regardless of size (today's behaviour)

#### Scenario: Open anyway escalates

- **WHEN** a file is in safe mode and the user chooses "open anyway"
- **THEN** the full editor loads that file for the session

### Requirement: Opt-in save hygiene

Reado SHALL let the user enable trimming trailing whitespace and inserting a
final newline, applied only when a file is written to disk. Both SHALL default to
off, honouring Reado's read-first, non-destructive stance, and SHALL never alter
a file that is merely opened for reading.

#### Scenario: Trim on save

- **WHEN** "trim trailing whitespace" is on and the user saves an edited file
- **THEN** trailing whitespace is removed on the write, and a file that is only
  read (never saved) is left byte-for-byte unchanged

#### Scenario: Final newline on save

- **WHEN** "insert final newline" is on and the user saves a file lacking one
- **THEN** exactly one trailing newline is ensured on the write

#### Scenario: Defaults change nothing

- **WHEN** both settings are at their default (off)
- **THEN** saving writes the buffer as-is, matching current behaviour

### Requirement: File settings persistence and confinement

The file-related settings SHALL persist in `reado.settings`, apply through
Reado's existing path-confined filesystem layer without adding any unconfined
capability, and — being machine-portable preferences — be included in the
settings-sync allow-list.

#### Scenario: No new unconfined access

- **WHEN** any file setting is applied
- **THEN** all filesystem access stays within the confined project-root layer;
  no absolute paths outside the project are read or written on their behalf
