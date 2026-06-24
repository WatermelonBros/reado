## 1. Rust git backing

- [ ] 1.1 Add `git_file_history(root, file)` in `src-tauri/src/git.rs`: run `git log --follow --format=…` for the file, returning `{ hash, author, date, subject }[]` newest-first; empty on untracked/no-history/git-unavailable.
- [ ] 1.2 Add `git_show_commit(root, file, hash)` returning the file's content at the commit and at its parent (or the existing `git_show_ref` pair) so a parent-vs-commit diff can be rendered.
- [ ] 1.3 Register both commands in the Tauri builder and expose typed wrappers in the frontend git lib.

## 2. Timeline panel

- [ ] 2.1 Add `timeline` to `WorkspaceState.Tool` in `src/lib/store.ts` and wire it into the sidebar tool list + activity bar icon.
- [ ] 2.2 Build the Timeline panel: list commits for the active file (short hash, author, date, subject), newest first; lazy-fetch on show and refetch when the active file changes.
- [ ] 2.3 Empty/edge states: no active file, untracked file, no history, git unavailable — honest surfaces, no silent failure.

## 3. Diff on selection

- [ ] 3.1 Clicking a Timeline entry opens a read-only diff of that commit against its parent, reusing `src/components/organisms/DiffView.tsx`.
- [ ] 3.2 Make the diff explicitly read-only and labelled with the commit (hash/subject); closing returns to the prior view.

## 4. Copy & i18n

- [ ] 4.1 Add EN+IT strings (panel title, column labels, empty/edge states) to `src/i18n/locales/en.json|it.json`.

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green.
