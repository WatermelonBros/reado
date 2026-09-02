# Tasks — Phase 3: Backend-dependent settings

> The **settings-files** capability in full — exclude globs, session restore, save
> hygiene and the large-file guard — plus the **settings-git-signals** capability
> (inline blame, diff gutter). The first three landed in the original pass; the
> guard and the git signals followed, and this file records both.

## 1. Store (`src/lib/store.ts`)

- [x] 1.1 Added `excludeGlobs` (`[]`), `restoreSession` (true),
      `trimTrailingWhitespace` (false), `insertFinalNewline` (false).
- [x] 1.1b Added `largeFileGuardMb` (2), `inlineBlame` (off), `diffGutter` (off).

## 2. Backend — filesystem (`src-tauri/src/fs.rs`, `search.rs`)

- [x] 2.1 `list_dir` / `list_files` accept `exclude` globs and apply them via an
      `ignore` Override (gitignore-composed, applied even when hidden is shown).
      Shared `exclude_overrides` helper.
- [x] 2.2 `search_text` honours the same globs (ripgrep `-g '!pat'`, and the
      in-process fallback via the shared override helper).
- [x] 2.3 `read_file` takes `guard_bytes` and returns `Large { size }` without
      reading; `0`/absent bypasses it ("open anyway"). The hard `MAX_TEXT_BYTES`
      cap still wins over a looser guard.
- [x] 2.4 No new unconfined capability; all paths stay within the root layer.

## 3. Backend — git signals

- [x] 3.1 Inline blame reuses the cached `git_blame`; one fetch feeds both the
      blame column and the cursor-line annotation.
- [x] 3.2 `git_working_diff_lines(root, file)` — `git diff --unified=0 HEAD`,
      parsed with the existing hunk parser.

## 4. Frontend wiring

- [x] 4.1 `api.ts` `listDir`/`listFiles`/`searchText` pass `excludeGlobs` (read
      from the store, no call-site churn); ProjectView bumps `treeNonce` when the
      globs change so the tree/search re-list live.
- [x] 4.2 `restoreSession`: ProjectView restores the saved session only when on;
      the stored session is never deleted.
- [x] 4.3 The editor renders a `large` file as a size + "Open anyway", and
      remembers the files the user overruled so a reload doesn't re-ask.
- [x] 4.4 Save hygiene: `saveFile` trims trailing whitespace / ensures a final
      newline before the confined `write_file`, only on save, only when enabled.
- [x] 4.5–4.6 Inline blame (cursor line only) and the diff gutter, both as
      CodeMirror compartments reconfigured from their settings.

## 5. Settings UI (`src/components/organisms/Settings.tsx`)

- [x] 5.1 New **Files** tab: exclude-globs editor (one per line, commit on blur),
      restore-session toggle, and an "On save" section (trim / final newline).
- [x] 5.2 Large-file guard field in the Files tab; a repo-gated "Git signals"
      section for the two toggles.

## 6. i18n (`src/i18n/locales/{en,it}.json`)

- [x] 6.1 Files tab label + exclude/restore/save-hygiene labels & hints, plus the
      large-file guard and the git-signals section (EN + IT).

## 7. Cross-cutting

- [x] 7.1 The sync policy is opt-out (`SETTINGS_EXCLUDED`), so the three new
      fields travel between machines without a whitelist edit;
      `settingsSyncCoversAllKeys` guards that they stay classified.

## 8. Verify

- [x] 8.1 Rust test: `list_dir` honours exclude globs (dir + `*.glob`, blanks
      ignored). Full Rust + frontend suites green.
- [x] 8.2 Manual: exclude hides from tree + search live; restore-off starts clean
      but keeps the stored session; save hygiene only on save, defaults change
      nothing.
