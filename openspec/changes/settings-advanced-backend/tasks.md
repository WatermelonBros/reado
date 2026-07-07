# Tasks — Phase 3: Backend-dependent settings

> Landed this pass: the **settings-files** capability except the large-file guard
> — exclude globs, session restore, and save hygiene. **Deferred to a follow-up**
> (heavier plumbing, tracked below): the large-file guard and the whole
> **settings-git-signals** capability (inline blame, diff gutter).

## 1. Store (`src/lib/store.ts`)

- [x] 1.1 Added `excludeGlobs` (`[]`), `restoreSession` (true),
      `trimTrailingWhitespace` (false), `insertFinalNewline` (false).
- [ ] 1.1b Deferred: `largeFileGuard`, `inlineBlame`, `diffGutter`.

## 2. Backend — filesystem (`src-tauri/src/fs.rs`, `search.rs`)

- [x] 2.1 `list_dir` / `list_files` accept `exclude` globs and apply them via an
      `ignore` Override (gitignore-composed, applied even when hidden is shown).
      Shared `exclude_overrides` helper.
- [x] 2.2 `search_text` honours the same globs (ripgrep `-g '!pat'`, and the
      in-process fallback via the shared override helper).
- [ ] 2.3 Deferred: `read_file` large-file flag + "open anyway" bypass.
- [x] 2.4 No new unconfined capability; all paths stay within the root layer.

## 3. Backend — git signals (deferred)

- [ ] 3.1 Inline blame (reuse `git_blame`; current-line author/date).
- [ ] 3.2 Diff gutter (needs working-tree-vs-HEAD line ranges — a new call, as
      the existing `git_diff_lines` diffs two refs, not the working tree).

## 4. Frontend wiring

- [x] 4.1 `api.ts` `listDir`/`listFiles`/`searchText` pass `excludeGlobs` (read
      from the store, no call-site churn); ProjectView bumps `treeNonce` when the
      globs change so the tree/search re-list live.
- [x] 4.2 `restoreSession`: ProjectView restores the saved session only when on;
      the stored session is never deleted.
- [ ] 4.3 Deferred: large-file safe mode.
- [x] 4.4 Save hygiene: `saveFile` trims trailing whitespace / ensures a final
      newline before the confined `write_file`, only on save, only when enabled.
- [ ] 4.5–4.6 Deferred: inline blame, diff gutter.

## 5. Settings UI (`src/components/organisms/Settings.tsx`)

- [x] 5.1 New **Files** tab: exclude-globs editor (one per line, commit on blur),
      restore-session toggle, and an "On save" section (trim / final newline).
- [ ] 5.2 Deferred: large-file guard field; git-signals (repo-gated).

## 6. i18n (`src/i18n/locales/{en,it}.json`)

- [x] 6.1 Files tab label + exclude/restore/save-hygiene labels & hints.

## 7. Cross-cutting

- [x] 7.1 Added the new keys to the settings-sync allow-list.

## 8. Verify

- [x] 8.1 Rust test: `list_dir` honours exclude globs (dir + `*.glob`, blanks
      ignored). Full Rust + frontend suites green.
- [x] 8.2 Manual: exclude hides from tree + search live; restore-off starts clean
      but keeps the stored session; save hygiene only on save, defaults change
      nothing.
