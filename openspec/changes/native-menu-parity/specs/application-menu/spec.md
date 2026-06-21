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
