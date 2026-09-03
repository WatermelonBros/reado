## Why

Reado frames itself as an *inverted code review* tool, yet its git surface is
file-level only. Two gaps stand out for a review-first IDE:

1. **No partial staging.** `git_stage`/`git_unstage` operate on whole files only;
   there is no way to stage or unstage a single hunk or line, which is table
   stakes for curating a commit while reviewing.
2. **No conflict resolution.** Conflicts are *detected* (`git.rs` parses the
   `conflicted` status and the panel shows a badge) but there is no flow to
   resolve them — no per-file conflict view, no take-ours/take-theirs/edit, no
   mark-resolved. A user who hits a conflict has to leave Reado.

## What Changes

- **git-hunk-staging** (capability): stage / unstage / discard at the **hunk**
  (and line) level from the diff view, backed by `git apply --cached`/`--reverse`
  of a computed patch, updating the diff and status live. Whole-file actions stay.
- **merge-conflict-resolution** (capability): a conflict view per conflicted file
  — the conflict regions parsed and shown with take-ours / take-theirs / take-both
  / manual-edit, and a mark-resolved (`git add`) once clean; honest gating (only
  in a repo, only for conflicted files) and a path to `--abort` the merge/rebase.

Both are additive to the existing `GitPanel` / `DiffView` and the Rust git layer;
no new unconfined capability (all through the `git` binary in the project root).

Out of scope: interactive rebase UI; a full commit-graph view (tracked
separately); three-way merge editor beyond ours/theirs/edit.

## Capabilities

### Added Capabilities

- **git-hunk-staging** — stage, unstage, and discard individual hunks and lines
  from the diff, so a reviewer can curate exactly what a commit contains.
- **merge-conflict-resolution** — an in-app flow to view and resolve merge
  conflicts (take ours/theirs/both/edit, mark resolved, abort), so hitting a
  conflict no longer forces the user out of Reado.
