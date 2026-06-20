## ADDED Requirements

### Requirement: Open Local Folder
Reado SHALL open any local folder as a project, regardless of whether it is a git repository. When the folder is a git repository, git-dependent features (diff base picker, git-diff anchoring remap) SHALL be enabled; otherwise the app SHALL operate in read + comment mode without errors.

#### Scenario: Open a git repository
- **WHEN** the user opens a folder that contains a `.git` directory
- **THEN** the project loads with the file tree, editor, and git-dependent features enabled

#### Scenario: Open a non-git folder
- **WHEN** the user opens a folder with no git repository
- **THEN** the project loads in read + comment mode
- **AND** git-dependent features are disabled without raising an error

### Requirement: Recent Projects Screen
On launch with no project context, Reado SHALL present a recent-projects screen listing previously opened projects plus an action to open a new folder.

#### Scenario: Launch shows recents
- **WHEN** the app starts and at least one project was opened before
- **THEN** the recent-projects screen lists those projects most-recent first
- **AND** offers an "open folder" action

### Requirement: One Window Per Project
Reado SHALL open each project in its own window, and SHALL allow multiple project windows to be open simultaneously, each with independent terminals and state.

#### Scenario: Open a second project
- **WHEN** a project is open and the user opens a different project
- **THEN** the second project opens in a new window with its own terminals and state

### Requirement: File Tree
Reado SHALL display a file tree that respects `.gitignore` by default, with a toggle to reveal hidden/ignored files.

#### Scenario: Ignored files hidden by default
- **WHEN** a project contains gitignored paths such as `node_modules`
- **THEN** the file tree hides them by default

#### Scenario: Reveal hidden files
- **WHEN** the user enables the "show hidden" toggle
- **THEN** previously hidden and ignored files appear in the tree

### Requirement: Tool Sidebar
Reado SHALL provide a slim, icon-only activity rail on the left edge that switches the side panel between tools. The rail SHALL host the available tools (at minimum: Files, Search, Comments) and SHALL reserve a place for tools that arrive with later capabilities (e.g. Git/Diff, Orphans, Knowledge Graph, History). Selecting the active tool again SHALL collapse the side panel; selecting another SHALL switch to it. The rail SHALL be quiet and unobtrusive, consistent with the read-first aesthetic.

#### Scenario: Switch tool
- **WHEN** the user clicks a different tool icon in the rail
- **THEN** the side panel shows that tool's panel

#### Scenario: Collapse the panel
- **WHEN** the user clicks the icon of the already-active tool
- **THEN** the side panel collapses, leaving more room for reading
- **AND** clicking any tool icon re-opens the panel

### Requirement: Session Restore
On reopening a project, Reado SHALL restore the prior session: open files and tabs, scroll positions, and terminal sessions.

#### Scenario: Reopen restores state
- **WHEN** the user reopens a project they previously worked in
- **THEN** the open files, tabs, scroll positions, and terminal tabs are restored as they were

### Requirement: Settings
Reado SHALL support global settings (in the user config directory) and per-project overrides (in `.reado/config`), editable through a settings UI and on disk.

#### Scenario: Per-project override
- **WHEN** a setting is defined both globally and in a project's `.reado/config`
- **THEN** the per-project value takes effect for that project

### Requirement: Status Bar
Reado SHALL display a status bar showing the active file path, cursor line:column, current git branch, the count of open comments, and the agent run status.

#### Scenario: Status reflects context
- **WHEN** a file is focused in a git project
- **THEN** the status bar shows the file path, line:column, branch, open-comment count, and agent status

### Requirement: Internationalization
Reado SHALL ship with internationalized UI strings supporting at least Italian and English, selectable in settings.

#### Scenario: Switch UI language
- **WHEN** the user selects a different UI language in settings
- **THEN** the interface strings update to the selected language

### Requirement: Empty State Guidance
When a project has no comments yet, Reado SHALL show a discreet empty-state hint explaining how to leave the first comment, which disappears after the first comment is created.

#### Scenario: First-time hint
- **WHEN** a project with zero comments is opened
- **THEN** a hint explains the comment-creation gesture
- **AND** the hint no longer appears once a comment exists
