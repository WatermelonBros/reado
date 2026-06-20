## ADDED Requirements

### Requirement: Overlay Anchoring Model
Comments SHALL be anchored to code as an external overlay (file + line/range), never by inserting markers into the code. The current position SHALL be tracked in the SQLite index and persisted in the comment `.md`.

#### Scenario: Anchor without touching code
- **WHEN** a comment is anchored to lines in a file
- **THEN** the file content is unchanged
- **AND** the position is recorded in the index and the comment `.md`

### Requirement: Adaptive Context Snapshot
For each comment, Reado SHALL store an adaptive snippet of the anchored code plus enough surrounding context to be uniquely locatable, expanding the context when the content would otherwise be ambiguous.

#### Scenario: Ambiguous content expands context
- **WHEN** the anchored lines are not unique within the file
- **THEN** the stored snippet expands its surrounding context until the match is unique

### Requirement: In-Editor Live Tracking
While a file is edited inside Reado, comment markers SHALL move with the text automatically so positions stay correct.

#### Scenario: Edit inside the tool
- **WHEN** the user inserts lines above an anchored comment in the editor
- **THEN** the comment marker shifts down to remain on the same code

### Requirement: External-Edit Remap
When a file is modified outside the editor (including by an AI agent), Reado SHALL recompute the anchor by first mapping old→new lines via git diff, then falling back to a fuzzy match of the stored snippet when git mapping is unavailable or fails.

#### Scenario: Remap after agent edit
- **WHEN** an agent modifies a file and shifts an anchored region
- **THEN** Reado remaps the anchor using git diff
- **AND** if git mapping fails, it locates the region by fuzzy snippet match

### Requirement: AST-Assisted Anchoring
Where a tree-sitter grammar exists for the language, Reado SHALL use AST nodes to assist structural re-anchoring.

#### Scenario: Anchor follows a moved function
- **WHEN** a function containing an anchored comment is moved within a file in a tree-sitter-supported language
- **THEN** AST assistance helps re-anchor the comment to the same construct

### Requirement: Recompute Triggers
Reado SHALL recompute anchors on file-change events from the watcher and when a file is opened. The watcher SHALL observe the repository excluding gitignored paths, with debouncing, and SHALL NOT poll.

#### Scenario: Recompute on watcher event
- **WHEN** the watcher reports a change to a tracked file
- **THEN** the anchors of that file's comments are recomputed

### Requirement: Orphan Detection and Manual Re-Anchor
When an anchor cannot be recomputed, Reado SHALL flag the comment as `orphan`, never point it at an incorrect line, and surface it in an orphans panel showing the last-known context with a manual re-anchor action.

#### Scenario: Re-anchoring fails
- **WHEN** neither git mapping nor fuzzy match can locate the anchor
- **THEN** the comment is flagged orphan and listed in the orphans panel with its last-known context
- **AND** the user can manually re-anchor it

### Requirement: File Rename and Delete Handling
On file rename/move, Reado SHALL update the stored path automatically from the watcher's rename event. On file delete, affected comments SHALL become orphan rather than be lost.

#### Scenario: Rename updates path
- **WHEN** a file with anchored comments is renamed
- **THEN** the comments' stored path is updated automatically

#### Scenario: Delete orphans comments
- **WHEN** a file with anchored comments is deleted
- **THEN** those comments become orphan and remain in the orphans panel
