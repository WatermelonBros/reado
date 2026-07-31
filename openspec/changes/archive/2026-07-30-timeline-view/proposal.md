## Why

Reading code is reading history: a function's current shape only makes sense
once you see how it got there — who changed it, when, and why. Today Reado can
diff the active file against a chosen base, but it can't answer "how did *this
file* evolve?" without dropping to a terminal. That breaks the calm, read-first
flow and the comment↔AI loop, where understanding the intent behind a change is
exactly what a reviewer needs before annotating it.

A per-file **Timeline** closes that gap: the git history of the currently open
file, shown in a panel, with each entry opening a read-only diff of that change
against its parent. It is purely about understanding — no writes, no commits —
and it reuses the existing diff view rather than inventing a new surface.

## What Changes

- **New side-panel tool `timeline`** (`WorkspaceState.Tool` in
  `src/lib/store.ts`): lists the commits that touched the active file
  (short hash, author, relative/absolute date, subject), newest first.
- **Rust backing** in `src-tauri/src/git.rs`: a `git_file_history(root, file)`
  command running `git log --follow --format=…` for the file, and a
  `git_show_commit(root, file, hash)` (parent-vs-commit) that feeds the diff.
  Lazy per file — history is only fetched when the Timeline is shown for a file.
- **Read-only diff on selection**: clicking a Timeline entry opens that commit's
  change against its parent, reusing `src/components/organisms/DiffView.tsx`
  (the same CodeMirror unified merge already used for the HEAD diff).
- **Reactivity**: the Timeline updates when the active file changes (driven by
  `useProject` / the editor's active path), with empty/untracked/no-history
  states and i18n copy in `src/i18n/locales/en.json|it.json`.

## Capabilities

### Added Capabilities
- `timeline-view`: a per-file git history panel whose entries open read-only diffs of each change against its parent.

## Out of Scope

- Writing history (rebase, revert, cherry-pick, amend) — read-only by design.
- Repository-wide history, graph/DAG visualisation, or branch topology.
- Line-level blame/annotation, and following a single function across renames.
- Restoring or checking out an old version of the file.
