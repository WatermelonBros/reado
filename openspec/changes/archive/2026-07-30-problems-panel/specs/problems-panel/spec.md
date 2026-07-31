## ADDED Requirements

### Requirement: Project-wide diagnostics aggregation

Reado SHALL aggregate the diagnostics published by the active language servers
across the whole project into a single side-panel tool (`problems`), grouping the
diagnostics by file. Each file group SHALL show the file's path and its own
problem count, and each diagnostic SHALL show its severity, message, and
line:column position.

#### Scenario: Diagnostics grouped by file

- **WHEN** the user opens the Problems panel while language servers have published
  diagnostics for two or more files
- **THEN** the panel shows one collapsible group per file, each labeled with the
  file path and the number of problems in that file

#### Scenario: Empty state when nothing is broken

- **WHEN** the Problems panel is open and no diagnostics exist (or none match the
  active filters)
- **THEN** the panel shows a calm "No problems" empty state instead of any groups

### Requirement: Navigate to a diagnostic

Reado SHALL make every diagnostic row navigable: activating a row MUST open the
diagnostic's file and jump to its line and column (via the existing
`useProject.open(path, line)` path), so the reader lands on the problem.

#### Scenario: Click jumps to the location

- **WHEN** the user clicks (or activates via keyboard) a diagnostic row for a file
  that is not currently focused
- **THEN** Reado opens that file and positions the editor at the diagnostic's
  line and column

### Requirement: Severity filter and counts

The Problems panel SHALL display aggregate project-wide counts per severity
(errors, warnings, info) and MUST provide toggles to filter the list by severity.
When a severity is toggled off, its diagnostics are hidden and file groups with no
remaining visible diagnostics are not shown.

#### Scenario: Filter hides a severity

- **WHEN** the user toggles the "warnings" filter off while warnings are present
- **THEN** all warning rows are hidden, file groups left with no visible rows are
  removed, and the error/info counts in the header are unchanged

#### Scenario: Counts reflect the project

- **WHEN** diagnostics exist across multiple files
- **THEN** the header shows the total number of errors, warnings, and info
  diagnostics aggregated across all files

### Requirement: Live updates

Reado SHALL keep the Problems panel in sync with the language servers: when a
language server publishes new diagnostics for a file, the panel MUST reflect the
change without a manual refresh, replacing that file's previous diagnostics and
removing the file's group when it has no remaining diagnostics.

#### Scenario: Problems clear as they are fixed

- **WHEN** a language server republishes diagnostics for a file with fewer (or no)
  problems than before
- **THEN** the panel updates that file's group to the new set, and removes the
  group entirely if the file now has no diagnostics

#### Scenario: New problems appear

- **WHEN** a language server publishes a new diagnostic for a file that had none
- **THEN** a group for that file appears in the panel with the new diagnostic and
  the header counts increase accordingly
