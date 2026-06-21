## ADDED Requirements

### Requirement: Mark Files Read
The user SHALL be able to mark a file as read or unread, and this SHALL persist
per project across restarts.

#### Scenario: Mark read
- **WHEN** the user marks the active file as read
- **THEN** it is recorded as read for this project and stays so after a restart

#### Scenario: Unmark
- **WHEN** the user marks a read file unread
- **THEN** it is recorded as unread

### Requirement: Auto-Mark On Scroll
Reado SHALL auto-mark a file as read once the user has scrolled through its full
length; an explicit manual mark/unmark always overrides the heuristic.

#### Scenario: Scrolled to the end
- **WHEN** the user scrolls a file from top to bottom
- **THEN** it becomes marked read (unless manually set unread)

### Requirement: Tree Indicators And Progress
The file tree SHALL show a quiet read/unread indicator per file and aggregate
progress per folder, and Reado SHALL surface a per-project read/total summary.

#### Scenario: Tree shows progress
- **WHEN** some files in a folder are read
- **THEN** the folder shows aggregate read/total and read files are visibly
  distinguished from unread ones

### Requirement: Persisted In Project
Reading-progress state SHALL live under the project's `.reado/` folder
(gitignored by default) so it is personal and survives restarts.

#### Scenario: Survives restart
- **WHEN** the project is reopened
- **THEN** previously read files are still marked read
