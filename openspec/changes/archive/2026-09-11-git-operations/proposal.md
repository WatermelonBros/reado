## Why

Reado's Source Control does the daily loop well — stage by hunk, commit, branch,
stash, fetch/pull/push, blame, conflicts, PRs. What it cannot do is fix what just
happened: a typo in the last commit message, a commit that has to come back out,
a fix that belongs on this branch too. All of those send the reader to a
terminal, which is the one place a read-first editor should not have to send
them.

These are independent commands over a repository that is already modelled — the
gap is breadth, not depth.

## What Changes

- **Amend the last commit**: reuse its message, or edit it, with whatever is
  staged now. Refused on a commit that is already pushed unless the user says to
  go ahead, because rewriting shared history is a different decision.
- **Revert a commit**: a new commit that undoes an old one, chosen from the
  history.
- **Cherry-pick a commit** from another branch onto this one.
- **Tags**: list, create (lightweight or annotated), delete, and push a tag.
- **Remotes**: list, add, rename, remove.
- Each reports what happened — including the conflicted case, which hands the
  file to the conflict resolver Reado already has.

## Capabilities

### Added Capabilities

- `git-operations`: amend, revert, cherry-pick, tags and remotes from the UI.
