## ADDED Requirements

### Requirement: Snapshot Last-Read Content
Reado SHALL capture a snapshot of a file's content (and a content hash) when the
file is marked read, persist it under the project's `.reado/` folder keyed by
project-relative path, and remove that snapshot when the file is marked unread.
Reado SHALL skip snapshotting content that exceeds a sane size guard (e.g.
binary or very large files).

#### Scenario: Snapshot on mark read
- **WHEN** the user marks a file as read
- **THEN** its current content and hash are stored as the last-read snapshot
  under `.reado/` and survive a restart

#### Scenario: Snapshot dropped on unmark
- **WHEN** the user marks a previously-read file unread
- **THEN** its last-read snapshot is removed

#### Scenario: Oversized content skipped
- **WHEN** a file marked read exceeds the size guard
- **THEN** Reado records it as read without storing a content snapshot

### Requirement: Detect Change Since Read
Reado SHALL treat a read file as changed-since-read when its current content
differs from its last-read snapshot, including when an external edit (e.g. the AI
agent) flips the file back to unread via the `file-changed` watcher event.

#### Scenario: Agent edits a read file
- **WHEN** an external change modifies a file that was marked read
- **THEN** Reado flags the file as changed-since-read and flips it to unread

#### Scenario: No real change
- **WHEN** a read file's content still matches its last-read snapshot
- **THEN** Reado does not flag it as changed-since-read

### Requirement: Review Only The Delta
Reado SHALL let the user review only the diff between a file's last-read snapshot
and its current content, rendered read-only as a unified diff with the snapshot
as the base, reachable from a "review changes" affordance on the file's
unread/changed state in the file tree and the editor.

#### Scenario: Open the delta
- **WHEN** the user triggers "review changes" on a changed-since-read file
- **THEN** a read-only delta view opens showing the diff between the last-read
  snapshot and the current content

#### Scenario: Nothing to review
- **WHEN** the user opens the delta for a file with no last-read snapshot or no
  difference
- **THEN** Reado shows an empty "no changes to review" state instead of a diff

### Requirement: Clear Back To Read After Review
Reado SHALL provide an explicit action in the delta view to mark the file
reviewed, which re-snapshots the current content as the new last-read baseline
and clears the changed-since-read marker so the file returns to read.

#### Scenario: Mark reviewed
- **WHEN** the user clears/marks-reviewed from the delta view
- **THEN** the current content becomes the new last-read snapshot, the
  changed-since-read marker is cleared, and the file is read again

#### Scenario: Changes again after review
- **WHEN** the file changes externally again after being marked reviewed
- **THEN** the delta is computed against the new baseline, showing only the
  latest changes
