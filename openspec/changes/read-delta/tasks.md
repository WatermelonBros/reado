## 1. Snapshot store (Rust)

- [ ] 1.1 Extend `src-tauri/src/progress.rs` to persist a per-file last-read
      snapshot under `.reado/` (content + hash + a size guard for
      binary/oversized files), keyed by project-relative path.
- [ ] 1.2 Update the `set_read` command: when marking read, accept the current
      content and store its snapshot/hash; when marking unread, drop the
      snapshot.
- [ ] 1.3 Add a command to fetch a file's last-read snapshot (returns content or
      none), for the frontend to build the delta base.
- [ ] 1.4 Unit tests: snapshot saved on read, dropped on unread, size guard
      skips oversized content, fetch returns the stored snapshot.

## 2. Frontend wiring

- [ ] 2.1 Extend `src/lib/api.ts` with the snapshot-aware `set_read` args and the
      fetch-snapshot command bindings.
- [ ] 2.2 Update `src/lib/readProgress.ts` so `mark(read=true)` passes the active
      buffer text to snapshot, and track which read files have **changed** since
      their snapshot.
- [ ] 2.3 In `src/components/pages/ProjectView.tsx`, when the `file-changed`
      handler flips a read file to unread, flag it as **changed-since-read** so a
      "review changes" affordance can appear.

## 3. Delta review UI

- [ ] 3.1 Add a delta view (reuse the unified-merge pattern from
      `src/components/organisms/DiffView.tsx`) that diffs current content against
      the last-read snapshot base instead of git HEAD.
- [ ] 3.2 Surface a quiet **"review changes"** affordance from the unread/changed
      state in the file tree row (`src/components/organisms/FileTree.tsx`) and in
      the editor; clicking it opens the delta view for that file.
- [ ] 3.3 Add a **"mark reviewed / clear"** action in the delta view that
      re-snapshots current content as the new baseline and clears the
      changed/unread marker (back to read).
- [ ] 3.4 Add i18n strings (EN + IT) for the review-changes affordance, the delta
      view header, the empty/no-changes state, and the clear action in
      `src/i18n/locales/en.json` and `it.json`.

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green
