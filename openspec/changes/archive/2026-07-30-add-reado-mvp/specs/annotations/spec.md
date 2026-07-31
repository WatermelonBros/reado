## ADDED Requirements

### Requirement: Create Comment
Reado SHALL let the user create a comment by selecting one or more lines and invoking a dedicated gesture (shortcut or gutter icon), opening an inline markdown editor. Comments are an overlay and SHALL NOT modify the underlying code file.

#### Scenario: Create from selection
- **WHEN** the user selects a line range and invokes the create-comment gesture
- **THEN** an inline markdown editor opens anchored to that range
- **AND** saving the comment does not alter the code file

### Requirement: Gutter Markers
Reado SHALL show a marker in the gutter for each anchored comment. When multiple comments share a point, the marker SHALL display a count and a click SHALL list the threads at that point.

#### Scenario: Overlapping comments
- **WHEN** more than one comment is anchored to the same line
- **THEN** the gutter marker shows the count
- **AND** clicking it lists the threads to choose from

### Requirement: Threaded Conversation
A comment SHALL be a thread supporting replies from the user and from AI agents.

#### Scenario: Reply in a thread
- **WHEN** the user or an AI adds a reply to a comment
- **THEN** the reply is appended to that comment's thread

### Requirement: Author Identity
Reado SHALL show the author of each message in a thread, and for AI authors SHALL display the originating agent's identity/logo (e.g. Claude Code, Codex, Copilot).

#### Scenario: AI message identity
- **WHEN** an AI agent posts a message in a thread
- **THEN** the message shows that agent's identity/logo distinct from the user's

### Requirement: Comment Types
A comment SHALL carry one fixed type from the set: Bug, Refactor, Performance, Question, Note.

#### Scenario: Assign a type
- **WHEN** the user assigns a type to a comment
- **THEN** the comment stores that type and it is usable for filtering

### Requirement: Comment States
A comment SHALL have a state in the set: open, in-progress, done, discarded. `orphan` is a separate flag, not a state.

#### Scenario: State transitions during resolution
- **WHEN** an agent starts work on a task and later completes it
- **THEN** the comment moves open → in-progress → done

#### Scenario: Discard a note
- **WHEN** the user closes a comment without action
- **THEN** the comment becomes discarded

### Requirement: Task vs Note Flag
A comment SHALL be flagged either as a task (eligible for the AI review batch) or as a note (excluded from the batch).

#### Scenario: Notes excluded from batch
- **WHEN** the user sends a review batch
- **THEN** only comments flagged as task are included

### Requirement: Markdown With Cross-References
Comment bodies SHALL support full markdown, including references to files/lines and links to other comments.

#### Scenario: Reference a file location
- **WHEN** the user writes a reference to `src/x.ts:42` in a comment
- **THEN** it renders as a navigable reference

### Requirement: Edit and Delete
Reado SHALL allow editing a comment's text and deleting a comment with confirmation. Deletion SHALL remove the comment entirely and SHALL NOT move it to the archive.

#### Scenario: Delete with confirmation
- **WHEN** the user deletes a comment and confirms
- **THEN** the comment is removed and does not appear in the archive

### Requirement: Comment Scope
A comment SHALL be anchorable at line/range, whole-file, or whole-project scope.

#### Scenario: File-level comment
- **WHEN** the user creates a comment scoped to a whole file
- **THEN** it is associated with the file rather than a specific line

### Requirement: Comment List With Filters
Reado SHALL provide a comment list filterable by state, type, and file, where selecting an item navigates to its anchor.

#### Scenario: Filter and jump
- **WHEN** the user filters the list to open Bug comments and selects one
- **THEN** the editor navigates to that comment's anchored location

### Requirement: Floating Thread Popover
When a comment is opened, its thread SHALL appear in a floating popover near the anchored line.

#### Scenario: Open a thread
- **WHEN** the user clicks a comment marker
- **THEN** the thread opens in a floating popover near the anchored line
