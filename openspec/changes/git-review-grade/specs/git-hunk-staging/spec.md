## ADDED Requirements

### Requirement: Stage and unstage by hunk

Reado SHALL let the user stage and unstage individual hunks of a tracked file's
changes from the diff view, applying only that hunk to the index (leaving the rest
of the file's changes as they were), with the diff and source-control status
updating live. Whole-file stage/unstage SHALL remain available.

#### Scenario: Stage one hunk

- **WHEN** a file has multiple changed hunks and the user stages one
- **THEN** only that hunk is added to the index; the other hunks remain unstaged
  and the status/diff reflect the split

#### Scenario: Unstage one hunk

- **WHEN** a staged file has a hunk the user unstages
- **THEN** only that hunk returns to unstaged, the rest staying staged

### Requirement: Discard by hunk

Reado SHALL let the user discard an individual unstaged hunk (reverting just that
change in the working tree), with a clear, explicit action given the destructive
nature.

#### Scenario: Discard a hunk

- **WHEN** the user discards a specific unstaged hunk
- **THEN** that change is reverted in the working tree and the other changes remain

### Requirement: Line-level staging

Reado SHALL allow staging/unstaging a selection of lines within a hunk where the
underlying patch can be computed unambiguously (this finer granularity MAY be
absent where the patch would be ambiguous).

#### Scenario: Stage selected lines

- **WHEN** the user selects a subset of added/removed lines in a hunk and stages
  them
- **THEN** only those lines are staged when the patch applies cleanly
