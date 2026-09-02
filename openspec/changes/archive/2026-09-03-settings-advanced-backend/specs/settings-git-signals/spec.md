## ADDED Requirements

### Requirement: Inline blame

Reado SHALL let the user enable a quiet per-line authorship annotation showing
the author and date of the current line, backed by the existing blame cache. The
control SHALL have effect only inside a git repository and SHALL read as
unavailable elsewhere.

#### Scenario: Blame appears for the current line

- **WHEN** inline blame is on inside a git repo and the caret rests on a line
- **THEN** a subtle end-of-line annotation shows that line's author and date;
  moving the caret updates it

#### Scenario: No repo, no blame

- **WHEN** the open project is not a git repository
- **THEN** the inline-blame control is shown as unavailable and no annotation is
  drawn

#### Scenario: Uncommitted lines

- **WHEN** the caret is on a line with no commit yet (new/unsaved)
- **THEN** the annotation indicates it is not yet committed rather than showing a
  stale or wrong author

### Requirement: Diff gutter markers

Reado SHALL let the user mark added, changed, and removed lines in the editor
gutter relative to the git base, updating as the file changes. The control SHALL
have effect only inside a git repository.

#### Scenario: Changes marked in the gutter

- **WHEN** diff gutter is on and the user edits a tracked file
- **THEN** added/changed lines are marked in the gutter and removed-line
  positions are indicated, updating live as edits continue

#### Scenario: Clean file shows nothing

- **WHEN** a tracked file matches the git base exactly
- **THEN** no diff markers are drawn

#### Scenario: Untracked or no repo

- **WHEN** the file is untracked, or the project is not a repo
- **THEN** the gutter draws no diff markers and the control reads as unavailable
  outside a repo

### Requirement: Git-signal settings persistence and gating

The git-signal settings SHALL persist in `reado.settings` with documented
defaults (off), apply live, and be machine-portable (settings-sync allow-list),
while all data comes from the existing git and blame layers with no new git
capability introduced.

#### Scenario: Default off

- **WHEN** the app runs with no persisted settings
- **THEN** inline blame and diff gutter are off by default
