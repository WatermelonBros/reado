## ADDED Requirements

### Requirement: In-App Badges and Status
Reado SHALL signal agent activity and results with in-app badges on comments and a run-status indicator.

#### Scenario: Comment badge updates
- **WHEN** an agent completes work on a comment
- **THEN** the comment shows a state badge reflecting the result

### Requirement: OS Notification on Completion
Reado SHALL emit an operating-system notification when an agent run completes, including when the app is in the background.

#### Scenario: Notify on run end
- **WHEN** an agent run finishes while Reado is in the background
- **THEN** an OS notification informs the user

### Requirement: Optional Completion Sound
Reado SHALL play an optional, disable-able sound when an agent run completes, and SHALL not emit other sounds.

#### Scenario: Completion sound toggle
- **WHEN** the completion sound is enabled and a run finishes
- **THEN** a sound plays
- **AND** when disabled, no sound plays

### Requirement: History Timeline
Reado SHALL provide a chronological view of archived (resolved) comments, filterable by file, period, and type.

#### Scenario: Browse history
- **WHEN** the user opens the history view
- **THEN** resolved comments are listed chronologically and can be filtered
