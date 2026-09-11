# timeline-view Specification

## Purpose
TBD - created by archiving change timeline-view. Update Purpose after archive.
## Requirements
### Requirement: Per-file commit history
Reado SHALL show, in a Timeline panel, the git commits that touched the
currently open file — each with its short hash, author, date, and subject —
listed newest-first.

#### Scenario: List the history of the active file
- **WHEN** the Timeline panel is shown for a tracked file with history
- **THEN** it lists the commits that touched that file (hash, author, date, subject), newest first

#### Scenario: File with no history
- **WHEN** the active file is untracked, has no commits, or git is unavailable
- **THEN** the Timeline shows an explicit empty state rather than failing silently

### Requirement: Read-only diff for a selected commit
Reado SHALL open a read-only diff of a selected Timeline entry against its
parent commit, reusing the existing diff view, so the reader sees exactly what
that change did to the file.

#### Scenario: Open a change from the Timeline
- **WHEN** the user clicks a Timeline entry
- **THEN** a read-only diff of that commit against its parent is shown in the diff view, labelled with the commit

#### Scenario: Diff is read-only
- **WHEN** a Timeline diff is open
- **THEN** the view is read-only and offers no edit, stage, or write action

### Requirement: Lazy Rust git backing
Reado SHALL back the Timeline with git commands on the Rust side
(`git log --follow` for history, `git show` for content), fetching a file's
history lazily — only when its Timeline is shown — and not on project load.

#### Scenario: History fetched on demand
- **WHEN** the Timeline is shown for a file whose history has not yet been loaded
- **THEN** Reado fetches that file's history via the Rust git backing at that moment, not eagerly at startup

### Requirement: Timeline tracks the active file
Reado SHALL update the Timeline when the active file changes, so the panel
always reflects the file currently being read.

#### Scenario: Switch the active file
- **WHEN** the user opens or focuses a different file while the Timeline is shown
- **THEN** the Timeline refetches and displays that file's history

### Requirement: Local file history

Reado SHALL keep a copy of a project file's previous content each time the file is
saved, independently of version control, and SHALL list those copies for the
active file in the Timeline panel with the time of each save.

#### Scenario: A file that was never committed

- **WHEN** the user saves a new file several times and opens the Timeline
- **THEN** each save is listed, newest first, even though git has no record of the
  file

#### Scenario: Unchanged content is not parked twice

- **WHEN** a save writes content identical to the newest entry
- **THEN** no new entry is added

#### Scenario: Bounded history

- **WHEN** a file has been saved more times than the retention allows, or entries
  are older than the retention window
- **THEN** the oldest entries are removed and the newest are kept

#### Scenario: Snapshots never cost a save

- **WHEN** the snapshot cannot be written
- **THEN** the save still completes and the failure is logged, not surfaced

### Requirement: Compare and restore a local entry

Selecting a local history entry SHALL show the difference between it and the file
as it is now, and Reado SHALL be able to restore that entry's content over the
current file as an undoable action, after the user confirms.

#### Scenario: Comparing with a past save

- **WHEN** the user selects an entry
- **THEN** the diff view shows that content against the current file, read-only

#### Scenario: Restoring

- **WHEN** the user confirms a restore
- **THEN** the file's content becomes the entry's content, and a single undo puts
  it back

