## ADDED Requirements

### Requirement: Conflict view per file

Reado SHALL present, for each conflicted file, its conflict regions parsed from
the standard conflict markers, so the user can see ours vs theirs side by side or
inline. This SHALL be available only inside a git repository and only for files in
a conflicted state.

#### Scenario: Show a file's conflicts

- **WHEN** a file is in a conflicted state after a merge/rebase
- **THEN** its conflict regions are shown with the ours and theirs sides clearly
  distinguished

#### Scenario: No conflicts, no view

- **WHEN** a file has no conflict markers
- **THEN** the conflict view is not offered for it

### Requirement: Resolve a conflict region

Reado SHALL let the user resolve each conflict region by taking ours, taking
theirs, taking both, or editing manually, updating the file accordingly.

#### Scenario: Take one side

- **WHEN** the user chooses take-ours (or take-theirs) for a region
- **THEN** the file is updated to that side and the conflict markers for that
  region are removed

#### Scenario: Manual edit

- **WHEN** the user edits the region by hand to a resolved state
- **THEN** the edited content replaces the conflict region

### Requirement: Mark resolved and abort

Once a conflicted file has no remaining markers, Reado SHALL let the user mark it
resolved (stage it), and SHALL offer to abort the in-progress merge/rebase.

#### Scenario: Mark resolved

- **WHEN** a previously conflicted file has all regions resolved
- **THEN** the user can mark it resolved and it moves to staged

#### Scenario: Abort

- **WHEN** the user chooses to abort the in-progress merge or rebase
- **THEN** Reado runs the corresponding abort and returns the working tree to its
  pre-operation state
