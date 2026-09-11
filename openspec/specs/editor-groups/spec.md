# editor-groups Specification

## Purpose
TBD - created by archiving change 2026-09-11-editor-groups. Update Purpose after archive.
## Requirements
### Requirement: Several Editor Groups

Reado SHALL show one or more editor groups side by side. Each group SHALL have
its own ordered tabs, its own active file and its own navigation history, and
exactly one group SHALL be focused at a time.

There SHALL always be at least one group: closing the last tab of the last group
SHALL leave an empty group rather than no editor at all.

#### Scenario: A third file gets its own pane

- **WHEN** the user splits with two groups already open
- **THEN** a third group appears beside them, and all three files are visible

#### Scenario: Each group has its own tabs

- **WHEN** two groups are open with different files
- **THEN** each group's tab strip lists only its own files

#### Scenario: History is per group

- **WHEN** the user navigates in one group and then goes back
- **THEN** that group returns to its own previous file, and the other group does
  not move

#### Scenario: The last group stays

- **WHEN** the user closes the last tab of the only group
- **THEN** the group remains, showing the empty state

### Requirement: Focusing A Group

The user SHALL be able to focus a group by number (the first nine), and by
clicking in it. Opening a file SHALL open it in the focused group.

Closing a group's last tab SHALL close the group and focus a neighbour.

#### Scenario: Jumping by number

- **WHEN** the user presses the shortcut for group 2
- **THEN** group 2 is focused, and the status bar and breadcrumb describe its file

#### Scenario: Opening lands where you are

- **WHEN** a file is opened from the tree while group 2 is focused
- **THEN** it opens as a tab in group 2

#### Scenario: A closed group hands over

- **WHEN** the user closes the last tab of group 2 of three
- **THEN** group 2 disappears and a neighbouring group is focused

### Requirement: Groups Survive The Session

The arrangement of groups — how many, which files in each, which is active —
SHALL be saved with the project's session and restored when it is reopened.

#### Scenario: Three panes come back

- **WHEN** the user reopens a project last left with three groups
- **THEN** the three groups are restored with their files and their active tabs
