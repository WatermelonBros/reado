## ADDED Requirements

### Requirement: Fuzzy File Open
Reado SHALL provide a fuzzy file finder (Cmd+P) to open files by name quickly.

#### Scenario: Open by fuzzy name
- **WHEN** the user invokes the file finder and types a partial file name
- **THEN** matching files are ranked fuzzily and the selected one opens

### Requirement: Full-Text Search
Reado SHALL provide full-text search across the project using ripgrep, respecting `.gitignore`.

#### Scenario: Search a string
- **WHEN** the user searches for a string
- **THEN** matching lines across the project are listed with file and line
- **AND** selecting a result navigates to that location

### Requirement: Command Palette
Reado SHALL provide a command palette (Cmd+K) exposing key actions such as open file, jump to comment, send review, and launch agent.

#### Scenario: Run an action from the palette
- **WHEN** the user opens the command palette and selects an action
- **THEN** that action is executed

### Requirement: Keyboard Shortcuts
Reado SHALL bind key actions (create comment, navigate comments, send review, launch agent, toggle panels) to keyboard shortcuts.

#### Scenario: Create a comment by shortcut
- **WHEN** the user selects lines and presses the create-comment shortcut
- **THEN** the inline comment editor opens for the selection
