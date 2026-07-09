# Tasks — Git review-grade (hunk staging + conflict resolution)

## 1. Backend — hunk staging (`src-tauri/src/git.rs`)

- [ ] 1.1 Compute a per-hunk patch from the file diff; `git_apply_patch(root, patch,
      {cached, reverse})` wrapping `git apply` with the right flags.
- [ ] 1.2 Stage hunk = apply `--cached`; unstage hunk = apply `--cached --reverse`;
      discard hunk = apply `--reverse` (working tree). Guard confinement.

## 2. Backend — conflicts (`src-tauri/src/git.rs`)

- [ ] 2.1 Parse conflict regions from a file's markers; `git_conflict_regions`.
- [ ] 2.2 `git_merge_abort` / `git_rebase_abort`; mark-resolved reuses `git_stage`.

## 3. Frontend — hunk staging (`DiffView.tsx`, `GitPanel.tsx`)

- [ ] 3.1 Per-hunk stage/unstage/discard controls in the diff; live refresh.
- [ ] 3.2 Optional line-selection staging when the patch is unambiguous.

## 4. Frontend — conflicts (new `ConflictView.tsx`)

- [ ] 4.1 Conflict view (ours/theirs/both/edit) per region; mark-resolved; abort.
- [ ] 4.2 Entry from the conflicted badge in `GitPanel`.

## 5. i18n + design

- [ ] 5.1 Keys for both flows; impeccable pass on the conflict view (calm, honest,
      destructive actions clearly marked); reduce-motion safe.

## 6. Tests

- [ ] 6.1 Backend: patch apply round-trips (stage/unstage/discard a hunk); conflict
      region parsing; abort.
- [ ] 6.2 Frontend: hunk control wiring; conflict resolve actions.

## 7. Verify

- [ ] 7.1 `cargo fmt/clippy/test`; `pnpm typecheck && pnpm test`; verify in-app.
