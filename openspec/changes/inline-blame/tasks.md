## 1. Rust blame backing (lazy, cached)

- [x] 1.1 `git_blame(root, file)` in `src-tauri/src/git.rs` returns per-line
      `{ line, hash, author, time, summary }` from `git blame --line-porcelain`,
      and an empty list when git is unavailable or the file is untracked.
- [x] 1.2 Cache blame results per `(root, file)` keyed on HEAD + the file's mtime
      (`BlameCache` managed state); a repeated toggle or re-open reuses the cache,
      invalidated when HEAD or mtime changes.
- [x] 1.3 Lazy: blame is only computed when the frontend requests it (blame mode
      on), never eagerly on file open.

## 2. Calm gutter presentation (frontend)

- [x] 2.1 Per-line annotation "author · relative age" in `src/lib/blameGutter.ts`,
      faint, in the UI font.
- [x] 2.2 Uncommitted lines rendered muted; no per-line recency/author coloring.
- [x] 2.3 Toggle from `Breadcrumb.tsx` with `aria-pressed` and the `blame.toggle`
      i18n label (EN + IT); state in `store.ts`, default `false`.

## 3. Commit-context hover

- [x] 3.1 Hover shows the commit subject, abbreviated hash, full author and full
      date (enriched native title, richer than before).
- [ ] 3.2 Styled popover (`bg-overlay`/`border-line`) — DEFERRED: the calm native
      title already conveys the context and dismisses on mouse-out; a custom
      gutter-hover popover is a later polish.

## 4. Restraint & honest surfaces

- [x] 4.1 The gutter is its own column (does not shift code) and is separate from
      the comment gutter.
- [x] 4.2 Degrades silently to no annotation when git is unavailable or the file
      is untracked (empty list → no markers, no error).

## 5. Verify

- [x] 5.1 typecheck + cargo check green (build unaffected).
