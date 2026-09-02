## ADDED Requirements

### Requirement: Native Menu Structure
Reado SHALL present a native menu bar with the menus: Reado (app), File, Edit,
Selection, Go, View, Terminal, Window, and Help, on macOS, Windows, and Linux.

#### Scenario: Menus present
- **WHEN** the application is running
- **THEN** the native menu bar shows the app, File, Edit, Selection, Go, View,
  Terminal, Window, and Help menus

### Requirement: Menu Items Map To Existing Commands
Each custom menu item SHALL trigger an existing in-app command via the `menu`
event the frontend already routes; the menu adds no behavior the app lacks.

#### Scenario: Item invokes its command
- **WHEN** the user selects a menu item (e.g. "Find References")
- **THEN** the same action runs as the corresponding shortcut/palette command

### Requirement: File Menu Recent And Reopen
The File menu SHALL include an "Open Recent" submenu listing recent projects and
a "Reopen Closed Editor" item.

#### Scenario: Open a recent project
- **WHEN** the user picks a project from Open Recent
- **THEN** that project opens

#### Scenario: Reopen closed editor
- **WHEN** the user selects Reopen Closed Editor
- **THEN** the most recently closed tab reopens

### Requirement: Editing And Navigation Items
The Edit, Selection, and Go menus SHALL expose Replace, Find in Files, Replace in
Files, Toggle Comment, Go to Line, multi-cursor selection commands, and Back /
Forward / Find References / Go to Symbol navigation.

#### Scenario: Replace in files from the menu
- **WHEN** the user selects Edit → Replace in Files
- **THEN** the project search panel opens ready to replace

#### Scenario: Navigate back from the menu
- **WHEN** the user selects Go → Back
- **THEN** the editor navigates to the previous location in history

### Requirement: View And Terminal Menus
The View menu SHALL include Toggle Sidebar, Split Editor, Word Wrap, Focus Mode,
and an Appearance/Theme submenu; the Terminal menu SHALL include New Terminal,
Split Terminal, Send Review, and Audit.

#### Scenario: Split editor from the menu
- **WHEN** the user selects View → Split Editor
- **THEN** the editor splits side by side

#### Scenario: New terminal from the menu
- **WHEN** the user selects Terminal → New Terminal
- **THEN** a new terminal opens and is focused

### Requirement: Help Menu
The Help menu SHALL include Documentation, Website, Report Issue, Check for
Updates, and About / release notes.

#### Scenario: Open the website
- **WHEN** the user selects Help → Website
- **THEN** the Reado site opens in the default browser

#### Scenario: Check for updates from the menu
- **WHEN** the user selects Help → Check for Updates
- **THEN** the updater checks and reports up-to-date or offers the update

### Requirement: Accelerators And Disabled State
Menu items SHALL display accelerators matching the in-app shortcuts, and items
that require an open file SHALL be disabled when no file is open.

#### Scenario: Accelerator shown
- **WHEN** a menu item has an in-app shortcut
- **THEN** the menu displays that accelerator next to the item

#### Scenario: Disabled without a file
- **WHEN** no file is open
- **THEN** file-scoped items (e.g. Save, Go to Line) are disabled

### Requirement: Auto Save
Reado SHALL provide an Auto Save setting with modes off / after-delay /
on-focus-change, toggleable from the File menu, persisted per user. When enabled,
the active buffer's edits SHALL be written to disk automatically per the chosen
mode, without flagging the file unread (it is the user's own write).

#### Scenario: After-delay auto save
- **WHEN** Auto Save is set to after-delay and the user edits a file then pauses
- **THEN** Reado writes the file to disk automatically and clears the dirty state

#### Scenario: Toggle from the File menu
- **WHEN** the user toggles File → Auto Save
- **THEN** the mode changes and the choice persists across restarts

### Requirement: File Commands
The File menu SHALL include New File, Open File, Save As, Save All, and Revert
File, each confined to the project root.

#### Scenario: New file
- **WHEN** the user selects File → New File and names it
- **THEN** an empty file is created in the project and opened

#### Scenario: Revert file
- **WHEN** the user selects File → Revert File on a file with unsaved edits
- **THEN** the on-disk version is reloaded and the edits are discarded

#### Scenario: Save all
- **WHEN** several buffers have unsaved edits and the user selects Save All
- **THEN** every dirty buffer is written to disk

### Requirement: Open View Submenu
The View menu SHALL include an Open View submenu that switches the sidebar to a
chosen tool (Files, Search, Comments, Outline, Source Control, Extensions).

#### Scenario: Jump to a view
- **WHEN** the user selects View → Open View → Extensions
- **THEN** the sidebar shows the Extensions panel

### Requirement: Diagnostics Navigation
The Go menu SHALL include Next Problem and Previous Problem that move the cursor
to the next/previous language-server diagnostic in the active file.

#### Scenario: Jump to next problem
- **WHEN** the file has diagnostics and the user selects Go → Next Problem
- **THEN** the cursor moves to the next diagnostic's range

### Requirement: View Chrome Toggles
The View menu SHALL let the user toggle UI chrome — Activity Bar, Status Bar,
Breadcrumbs, Centered/Reading Layout, Render Whitespace, Render Control
Characters — and choose the split direction via an Editor Layout submenu. Each
toggle's state SHALL persist per user.

#### Scenario: Hide the status bar
- **WHEN** the user toggles View → Status Bar off
- **THEN** the status bar is hidden and stays hidden across restarts

#### Scenario: Render whitespace
- **WHEN** the user enables View → Render Whitespace
- **THEN** spaces and tabs are shown as visible marks in the editor

### Requirement: Terminal Commands
The Terminal menu SHALL include Clear Terminal and Restart Terminal in addition
to New / Split / Move terminal, Send Review, Audit, and Launch Claude / Codex /
Copilot.

#### Scenario: Clear the terminal
- **WHEN** the user selects Terminal → Clear Terminal
- **THEN** the focused terminal's scrollback is cleared

### Requirement: Focused-Window Routing
A menu action SHALL run only in the focused window, never broadcast to all open
windows.

#### Scenario: Menu action with multiple windows
- **WHEN** two windows are open and the user triggers a menu command in one
- **THEN** only that window performs the action
