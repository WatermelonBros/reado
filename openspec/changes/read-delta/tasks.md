## 1. Snapshot store (Rust)

- [x] 1.1 `src-tauri/src/progress.rs` persists last-read content snapshots in
      `.reado/read-snapshots.json` (path → content) with a 512KB size guard.
- [x] 1.2 `set_read` takes `content`: on read it snapshots (kept on unread so the
      delta baseline survives an external change; overwritten on the next read);
      oversized content is skipped.
- [x] 1.3 `get_read_snapshot(root, path)` returns the stored snapshot or none.
- [x] 1.4 Unit tests: snapshot saved on read, kept on unread, overwritten on
      re-read, size guard skips oversized content.

## 2. Frontend wiring

- [x] 2.1 `src/lib/api.ts`: `setReadState(..., content?)` + `getReadSnapshot`.
- [x] 2.2 `src/lib/readProgress.ts`: `mark(read=true)` snapshots the buffer (passed
      in, or read from disk); tracks a `changed` set; `markChanged`/`clearChanged`.
- [x] 2.3 `ProjectView` file-changed handler flags a read file as changed-since-read
      before flipping it to unread.

## 3. Delta review UI

- [x] 3.1 Delta view reuses `DiffView`/`DiffEditor` with a `LAST_READ_BASE`
      sentinel: the base is the last-read snapshot instead of a git ref.
- [x] 3.2 A quiet "Δ" review-changes affordance on the changed file's tree row
      opens the delta (sets diff base + diffing).
- [x] 3.3 "Mark reviewed" in the delta view re-snapshots current content and
      clears the changed marker (back to read).
- [x] 3.4 i18n EN + IT (`delta.*`).

## 4. Verify

- [x] 4.1 typecheck + cargo check (+ unit tests) + build green.
