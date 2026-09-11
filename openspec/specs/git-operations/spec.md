# git-operations Specification

## Purpose
TBD - created by archiving change 2026-09-11-git-operations. Update Purpose after archive.
## Requirements
### Requirement: Amend The Last Commit

Reado SHALL let the user amend the most recent commit: its message SHALL be
offered for editing, prefilled with the existing one, and whatever is staged SHALL
be folded into it.

When the commit being amended is already on the upstream, Reado SHALL say so and
ask before rewriting it, because that is a change to history other people have.

#### Scenario: Fixing the message

- **WHEN** the user amends with nothing staged and edits the message
- **THEN** the last commit keeps its changes and carries the new message

#### Scenario: Folding in a forgotten file

- **WHEN** the user stages a file and amends
- **THEN** that file is part of the last commit, and no new commit is created

#### Scenario: Already pushed

- **WHEN** the commit to amend is already on the upstream
- **THEN** Reado warns that this rewrites shared history and proceeds only if the
  user confirms

### Requirement: Revert A Commit

Reado SHALL let the user pick a commit from the history and revert it, creating a
new commit that undoes it. A revert that conflicts SHALL leave the conflicts in
the working tree and say so, so the existing conflict resolver can be used.

#### Scenario: Undoing a commit

- **WHEN** the user reverts a commit
- **THEN** a new commit undoing it is created, and the old commit stays in the
  history

#### Scenario: A revert that conflicts

- **WHEN** reverting cannot apply cleanly
- **THEN** Reado reports the conflicted files rather than claiming success

### Requirement: Cherry-Pick A Commit

Reado SHALL let the user apply a commit from another branch onto the current one,
choosing it from that branch's history. A cherry-pick that conflicts SHALL be
reported the same way a revert is.

#### Scenario: Taking one commit

- **WHEN** the user cherry-picks a commit from another branch
- **THEN** its change is applied as a new commit on the current branch

### Requirement: Tags

Reado SHALL list the repository's tags, and SHALL let the user create one
(lightweight, or annotated with a message), delete one, and push one to a remote.

#### Scenario: Creating a tag

- **WHEN** the user creates a tag with a name
- **THEN** it points at the current commit and appears in the tag list

#### Scenario: A name already taken

- **WHEN** the user creates a tag whose name exists
- **THEN** Reado says so and creates nothing

### Requirement: Remotes

Reado SHALL list the repository's remotes with their URLs, and SHALL let the user
add, rename and remove one.

#### Scenario: Adding a remote

- **WHEN** the user adds a remote with a name and URL
- **THEN** it appears in the list and can be fetched from
