# Tasks — Git review-grade (hunk staging + conflict resolution)

## 1. Backend — hunk staging (`src-tauri/src/git.rs`)

- [x] 1.1 Compute a per-hunk patch from the file diff; `git_apply_patch(root, patch,
      {cached, reverse})` wrapping `git apply` with the right flags.
- [x] 1.2 Stage hunk = apply `--cached`; unstage hunk = apply `--cached --reverse`;
      discard hunk = apply `--reverse` (working tree). Guard confinement.

## 2. Backend — conflicts (`src-tauri/src/git.rs`)

- [x] 2.1 Parse conflict regions from a file's markers; `git_conflict_regions`.
- [x] 2.2 `git_merge_abort` / `git_rebase_abort`; mark-resolved reuses `git_stage`.

## 3. Frontend — hunk staging (`DiffView.tsx`, `GitPanel.tsx`)

- [x] 3.1 Per-hunk stage/unstage/discard controls in the diff; live refresh.
- [x] 3.2 Optional line-selection staging when the patch is unambiguous.

## 4. Frontend — conflicts (new `ConflictView.tsx`)

- [x] 4.1 Conflict view (ours/theirs/both/edit) per region; mark-resolved; abort.
- [x] 4.2 Entry from the conflicted badge in `GitPanel`.

## 5. i18n + design

- [x] 5.1 Keys for both flows; impeccable pass on the conflict view (calm, honest,
      destructive actions clearly marked); reduce-motion safe.

## 6. Tests

- [x] 6.1 Backend: patch apply round-trips (stage/unstage/discard a hunk); conflict
      region parsing; abort.
- [x] 6.2 Frontend: hunk control wiring; conflict resolve actions.

## 7. Verify

- [x] 7.1 `cargo fmt/clippy/test`; `pnpm typecheck && pnpm test`; verify in-app.
