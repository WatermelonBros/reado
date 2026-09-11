## Why

Twenty minutes of work, no commit, an edit that destroyed the good version, and
undo already spent. Git has nothing — the file was never staged. Reado has
nothing either: the Timeline panel shows commits, and the only snapshots the
backend takes are the ones a bulk replace parks for its own undo.

Every editor of this class keeps local history: a copy of the file on each save,
independent of version control, for exactly this.

## What Changes

- On each save, Reado parks a copy of the file's previous content under
  `.reado/.history/`, keyed by the file's project-relative path.
- The Timeline panel gains a **Local history** section above the commits: each
  entry is a save, with its time; selecting one diffs it against the file as it is
  now, in the existing read-only diff view; a "Restore" action writes it back
  through the same backed-up write that everything else uses, so restoring is
  itself undoable.
- Retention that cannot grow without bound: at most 50 entries per file, none
  older than 30 days, and identical consecutive content is not parked twice.
- `.reado/.history/` is excluded from the tree, from search, and from the
  `versionReado` setting's "commit .reado/" behaviour — it is scratch space, like
  `.reado/.undo/`.

## Capabilities

### Added Capabilities

- `timeline-view`: the timeline also lists each save of the file, independent of
  git, and can restore one.
