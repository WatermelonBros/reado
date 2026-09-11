## 1. Backend

- [x] 1.1 `history_snapshot(root, path)`: copy the file's current bytes into
      `.reado/.history/<encoded rel path>/<nanos>`, skipping when the newest entry
      is byte-identical; prune to 50 entries / 30 days for that file.
- [x] 1.2 `history_list(root, path)` → `[{stamp, size}]`, newest first.
- [x] 1.3 `history_read(root, path, stamp)` → the parked content.
- [x] 1.4 Every path confined with `ensure_within`, as every other fs command is.
- [x] 1.5 Rust tests: snapshot writes one entry, an identical save adds none,
      pruning keeps the newest 50 and drops the old ones, a path outside the
      project is refused.

## 2. Save path

- [x] 2.1 Snapshot *before* the write, inside `fs::write_file` — the one door
      every write Reado makes to a project file goes through, so the save path,
      Save All, the close-flush and a bulk rewrite are all covered by one guard
      rather than four call sites.
- [x] 2.2 `.reado/` is skipped (that is Reado's own scratch and config), and
      `ensure_within` confines everything else to the project.
- [x] 2.3 Failure to snapshot never blocks the save — logged, not surfaced.

## 3. Timeline UI

- [x] 3.1 A "Local history" section listing the entries with relative times.
- [x] 3.2 Selecting an entry diffs the current file against that content.
- [x] 3.3 Restore, through `writeBacked` so ⌘Z takes it back; confirm first.
- [x] 3.4 i18n EN + IT (+ the locales this release adds).

## 4. Housekeeping

- [x] 4.1 `.reado/.history/` added to `MACHINE_LOCAL`, so turning on "version
      `.reado/`" still leaves one machine's history out of the repository. The
      tree and search already hide `.reado/`.
- [x] 4.2 Verify: UI test for listing, diffing and restoring; a file with no
      history shows the git section alone.
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
