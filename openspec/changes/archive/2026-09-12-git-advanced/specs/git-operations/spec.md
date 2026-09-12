## ADDED Requirements

### Requirement: Merge A Branch

Reado SHALL let the user merge another branch into the current one, choosing it
from the branches that exist. A merge that conflicts SHALL be reported as the
conflicted files rather than as a failure, so the existing conflict resolver can
be used.

#### Scenario: A clean merge

- **WHEN** the user merges a branch that applies cleanly
- **THEN** the merge commit is created and the panel refreshes to the new state

#### Scenario: A merge that conflicts

- **WHEN** the merge cannot apply cleanly
- **THEN** Reado names the conflicted files and leaves them in the working tree
  for the resolver, instead of reporting an error

### Requirement: Rebase Onto A Branch

Reado SHALL let the user replay the current branch onto another branch, chosen
from the branches that exist, reporting a conflicting rebase the same way a merge
is reported.

#### Scenario: Replaying onto another branch

- **WHEN** the user rebases onto a branch
- **THEN** this branch's commits are replayed on top of it

### Requirement: Plan An Interactive Rebase

Reado SHALL let the user plan an interactive rebase as an editable list of the
commits that would be replayed, oldest first, where each commit carries an action
— keep, squash, fixup, or drop — and can be moved within the plan. Reado SHALL
write the plan into git's todo file itself rather than opening an editor.

Reado SHALL refuse a plan git would refuse, saying why, before starting: a plan
that folds its first commit into nothing, and a plan that drops every commit.

Because the plan is written into a file git executes, Reado SHALL accept only
known actions and commit hashes, rejecting anything else rather than writing it.

#### Scenario: Squashing two commits

- **WHEN** the user marks a commit `squash` and starts the rebase
- **THEN** that commit is folded into the one before it, with git's own combined
  message, and no editor opens

#### Scenario: Reordering

- **WHEN** the user moves a commit earlier in the plan and starts the rebase
- **THEN** the commits are replayed in the planned order

#### Scenario: A plan git would refuse

- **WHEN** the first commit in the plan is marked `squash`, or every commit is
  marked `drop`
- **THEN** Reado says what is wrong and does not start the rebase

#### Scenario: A plan that is not one

- **WHEN** a plan carries an action outside the known set, or a value that is not
  a commit hash
- **THEN** the rebase is refused and nothing is written

#### Scenario: A merge in the range

- **WHEN** the range being replayed contains a merge commit
- **THEN** it is absent from the plan, because a plain interactive rebase never
  replays one and cannot be asked to

#### Scenario: Changes in the way

- **WHEN** the working tree has tracked changes
- **THEN** the dialog says to commit or stash them and does not offer to start,
  rather than letting git refuse after the fact

### Requirement: Finish The Operation In Progress

Reado SHALL determine which sequencer operation a repository is in the middle of
— a merge, a rebase, a cherry-pick or a revert — and SHALL offer the ending that
operation actually has: a commit for a merge, and continuing for the others.
Continuing SHALL stage the resolved files first, because the resolver writes
files without touching the index and git will not continue with unmerged paths.

#### Scenario: Continuing a rebase

- **WHEN** the last conflict of a rebase is resolved
- **THEN** the resolver offers to continue the rebase, and continuing carries it
  on rather than creating a commit

#### Scenario: Finishing a merge

- **WHEN** the last conflict of a merge is resolved
- **THEN** the resolver offers to mark it resolved, and the merge is finished by
  committing

### Requirement: Worktrees

Reado SHALL list the repository's worktrees with the branch each holds, let the
user open one as a project, add one, and remove one after asking — because
removing a worktree removes its directory.

A new worktree SHALL default to a directory beside the project rather than inside
it, so the file tree, the search index and git status do not see a second
checkout as part of this one. A branch that already exists SHALL be checked out
there; a name that does not SHALL be created there.

#### Scenario: Opening a second branch beside this one

- **WHEN** the user adds a worktree for a branch
- **THEN** that branch is checked out in its own directory, and the current
  working tree is untouched

#### Scenario: Removing one

- **WHEN** the user removes a worktree
- **THEN** Reado asks first, saying the directory goes with it

### Requirement: Submodules

Reado SHALL list the repository's submodules with whether each is initialised and
whether it sits at a commit other than the one pinned, SHALL update them (all or
one), and SHALL open an initialised one as a project.

#### Scenario: The empty directory

- **WHEN** a submodule has never been initialised
- **THEN** the panel says so, and acting on it clones and updates it

### Requirement: Signed Commits

Reado SHALL let the user turn commit and tag signing on or off for the open
repository by writing git's own `commit.gpgsign` and `tag.gpgsign`, and SHALL
read the current state from there rather than from a Reado setting.

#### Scenario: Turning signing on

- **WHEN** the user turns signing on
- **THEN** the repository's git config carries it, and every other git tool sees
  the same thing

### Requirement: Commit Graph

Reado SHALL show the history of every branch as a graph: one row per commit with
its subject, author and relative date, the branch and tag names pointing at it,
and lanes drawn from the parent relationships, with a merge distinguishable from
an ordinary commit.

A lane SHALL be freed as soon as nothing is waiting in it, so a long history
stays a few columns wide rather than growing a column per branch that ever
existed. A commit SHALL be selectable as the editor's diff base.

#### Scenario: Where a branch left and rejoined

- **WHEN** the history contains a branch that was merged back
- **THEN** the graph draws it leaving the trunk and rejoining at the merge

#### Scenario: Reading more

- **WHEN** the history is longer than the window read
- **THEN** the graph offers to read further rather than silently truncating

#### Scenario: From a commit to what it changed

- **WHEN** the user picks a commit in the graph and asks to diff against it
- **THEN** the editor's diff base becomes that commit
