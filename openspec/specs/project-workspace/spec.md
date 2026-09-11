# project-workspace Specification

## Purpose
TBD - created by archiving change add-reado-mvp. Update Purpose after archive.
## Requirements
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

Reado SHALL ship with internationalized UI strings supporting English, Italian,
Spanish, French and German, selectable in settings, and SHALL start in the OS
language when it is one of them. Every locale SHALL carry the same set of keys as
English, with the same placeholders.

#### Scenario: Switch UI language

- **WHEN** the user selects a different UI language in settings
- **THEN** the interface strings update to the selected language

#### Scenario: Following the system

- **WHEN** Reado starts for the first time on a machine whose language is one it
  ships
- **THEN** the interface is in that language

#### Scenario: A locale is complete

- **WHEN** a locale file is missing a key, or a string drops a placeholder
- **THEN** the test suite fails

### Requirement: Empty State Guidance
When a project has no comments yet, Reado SHALL show a discreet empty-state hint explaining how to leave the first comment, which disappears after the first comment is created.

#### Scenario: First-time hint
- **WHEN** a project with zero comments is opened
- **THEN** a hint explains the comment-creation gesture
- **AND** the hint no longer appears once a comment exists

### Requirement: Portable Workspace File

Reado SHALL be able to save the current set of workspace folders as a single
portable file, and to open a workspace from such a file. Folder paths SHALL be
stored relative to the file where possible, so the file can be committed and used
on another machine.

#### Scenario: Saving a workspace

- **WHEN** the user saves the workspace with two folders open
- **THEN** a workspace file is written naming both folders, relative to itself
  where possible

#### Scenario: Opening a workspace file

- **WHEN** the user opens a workspace file
- **THEN** every folder it names is opened in one window, the first as the primary
  folder

#### Scenario: Opened from the operating system

- **WHEN** a workspace file is opened from the OS (double click, `open`, argv)
- **THEN** Reado opens the workspace rather than showing the file's JSON

#### Scenario: Edits go back to the file

- **WHEN** a folder is added or removed in a window opened from a workspace file
- **THEN** that file is updated, not a folder's `.reado/workspace.json`

#### Scenario: A folder that has moved

- **WHEN** a workspace file names a folder that does not exist
- **THEN** the remaining folders open and the missing one is reported

#### Scenario: Folders opened directly are unaffected

- **WHEN** a folder is opened directly, with no workspace file
- **THEN** its folder list behaves exactly as it does today

### Requirement: Untitled Buffers

Reado SHALL offer a **New Untitled File** action that opens an empty editable
buffer with no path, named `Untitled-1`, `Untitled-2`, … — the lowest number not
currently in use. The action SHALL work with no project open.

An untitled buffer SHALL behave as a tab: it can be switched away from and back
to without losing its text, opened in the split pane, reordered and closed. Its
text SHALL live in Reado, and Reado SHALL make no file request on its behalf —
no read, no write, no git status, no comment re-anchoring, no reload-on-change.

Until it is saved, an untitled buffer SHALL be treated as plain text.

#### Scenario: Start typing with nothing open

- **WHEN** the user invokes New Untitled File with no project open
- **THEN** an empty buffer named `Untitled-1` opens and accepts typing

#### Scenario: The name is the lowest free number

- **WHEN** `Untitled-1` is open and the user invokes New Untitled File again
- **THEN** the new buffer is `Untitled-2`; if `Untitled-1` was closed first, the
  new buffer is `Untitled-1`

#### Scenario: Switching tabs keeps the text

- **WHEN** the user types into an untitled buffer, switches to another tab, and
  switches back
- **THEN** the text is still there

### Requirement: Saving An Untitled Buffer

Saving an untitled buffer SHALL be Save As: Reado SHALL ask for a destination,
write the buffer's text there, and replace the untitled tab with the tab for the
file that was created — at the same position, active, no longer dirty. The
buffer SHALL then behave as any other file, including its language.

Closing an untitled buffer that has text in it SHALL ask before discarding it.

#### Scenario: Save turns it into a file

- **WHEN** the user saves an untitled buffer and gives a destination
- **THEN** the file is written with the buffer's text, the untitled tab is gone,
  and the new file is open in its place

#### Scenario: Nowhere to put it

- **WHEN** the user saves an untitled buffer with no folder open
- **THEN** Reado says a folder has to be open — every write it makes is confined
  to one — instead of asking for a destination it could not use

#### Scenario: A cancelled save changes nothing

- **WHEN** the user dismisses the destination prompt
- **THEN** nothing is written and the untitled buffer is still open, still dirty

#### Scenario: Closing one with text asks

- **WHEN** the user closes an untitled buffer that has text in it
- **THEN** Reado asks before discarding it

#### Scenario: Closing an empty one does not

- **WHEN** the user closes an untitled buffer they never typed into
- **THEN** it closes without a prompt

### Requirement: Untitled Buffers Survive The Session

Session restore SHALL bring untitled buffers back **with their text**, alongside
the file tabs, for the project they were opened in.

#### Scenario: Reopen the project

- **WHEN** the user has untitled buffers open with text in them and reopens the
  project
- **THEN** those buffers are open again, with the same names and the same text
