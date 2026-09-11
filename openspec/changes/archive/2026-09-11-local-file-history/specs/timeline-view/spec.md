## ADDED Requirements

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
