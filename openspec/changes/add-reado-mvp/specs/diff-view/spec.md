## ADDED Requirements

### Requirement: On-Demand Diff
The diff view SHALL be off by default; the editor SHALL show only the code until the user explicitly requests a diff.

#### Scenario: Diff hidden by default
- **WHEN** a file is open and no diff is requested
- **THEN** only the code is shown, with no diff decorations

#### Scenario: Request a diff
- **WHEN** the user requests the diff for a file
- **THEN** the diff against the selected base is shown

### Requirement: Base Picker
Reado SHALL let the user choose the diff base: the working tree (uncommitted), a branch, or a specific commit, with search to find branches/commits.

#### Scenario: Diff against a commit
- **WHEN** the user selects a specific commit as the base
- **THEN** the diff is computed against that commit

### Requirement: Post-Hoc Snapshot and Revert
Because the agent writes files directly, Reado SHALL snapshot affected files before a run and offer a post-hoc diff with an easy revert of the agent's changes.

#### Scenario: Revert an agent change
- **WHEN** the user reviews the post-run diff and chooses to revert
- **THEN** the affected files are restored to their pre-run snapshot

### Requirement: Configurable Accept Posture
Reado SHALL let the user configure the review posture: auto-accept (apply and continue), view-diff post-hoc, or a prompt to review before keeping.

#### Scenario: Auto-accept posture
- **WHEN** the accept posture is set to auto-accept
- **THEN** agent changes are kept without prompting for review
