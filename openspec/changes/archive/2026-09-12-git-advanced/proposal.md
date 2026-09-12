## Why

`git-operations` closed the "fix what just happened" half — amend, revert,
cherry-pick, tags, remotes. What was still missing is the half that reshapes the
branch: merging, rebasing, and the things that are *about* the repository rather
than about one commit — worktrees, submodules, signing, and the history's shape.

Each of those is a reason to leave the editor for a terminal, and two of them are
worse than that. A rebase that stops on a conflict leaves Reado's resolver
offering "Commit", which is the wrong verb: a rebase ends with `--continue`, and
committing halfway through one is how a rebase gets lost. And an uninitialised
submodule is an empty directory that explains nothing about why the build fails.

## What Changes

- **Merge a branch** into the current one, with a conflict reported as work
  waiting rather than as a failure.
- **Rebase onto a branch**, and **plan an interactive rebase** as an editable
  list — keep / squash / fixup / drop, with reordering — instead of a todo file
  in an editor git spawns.
- **Finish the operation that is actually in progress**: the conflict resolver
  asks the repository whether it is in a merge, a rebase, a cherry-pick or a
  revert, and offers Continue where a merge offers Commit.
- **Worktrees**: list, open one as a project, add one (defaulting to a sibling
  directory, never inside the repository), remove one.
- **Submodules**: list with their state, clone/update all or one, open an
  initialised one as a project.
- **Signed commits**: a toggle that writes git's own `commit.gpgsign` and
  `tag.gpgsign` rather than keeping a second source of truth beside them.
- **A commit graph** over every branch, with lanes, refs, and a commit that can
  be made the editor's diff base.

## Capabilities

### Modified Capabilities

- `git-operations`: merge, rebase (plain and planned), sequencer continuation,
  worktrees, submodules, signing, and the commit graph.

## Impact

- `src-tauri/src/git.rs`: fourteen new commands; `ApplyOutcome` reused so every
  conflicting operation reports the same shape.
- `src/lib/gitOps.ts`, `GitPanel`, `ConflictView`, new `RebaseDialog` and
  `GitGraph`, a `gitGraphOpen` flag in the workspace store, one palette command.
- The interactive-rebase plan is written into a file git *executes*, so the set
  of allowed actions is validated in Rust as a trust boundary.
