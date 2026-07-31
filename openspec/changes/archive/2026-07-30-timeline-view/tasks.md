## 1. Rust git backing

- [x] 1.1 `git_file_history(root, file)` in `src-tauri/src/git.rs`: commits that
      touched the file (`git log --follow`, unit-separated fields) → `{ hash,
      author, time, subject }`, most recent first; empty when git unavailable.

## 2. Timeline panel

- [x] 2.1 `timeline` Tool + `TimelinePanel`: lists the active file's commits
      (subject, author, relative age), reloads when the active file changes.
- [x] 2.2 ActivityBar entry shown in a git repo; quiet empty/no-file states.

## 3. Diff on selection

- [x] 3.1 Clicking a commit sets the diff base to that commit and opens the diff
      view (reuses `DiffView`/`git_show_ref`), highlighting the active commit.

## 4. i18n + verify

- [x] 4.1 EN + IT (`timeline.*`).
- [x] 4.2 typecheck + cargo check + build green.

> Note: the diff shows current-vs-selected-commit (how the file changed since that
> point), reusing the diff base. A commit-vs-parent view is a later enhancement.
