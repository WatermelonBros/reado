## ADDED Requirements

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
