## ADDED Requirements

### Requirement: Column Selection Mode

Reado SHALL offer a column selection mode that persists until it is turned off.
While it is on, a plain drag in the editor SHALL select a rectangle rather than a
run of text, and the mode SHALL be visible in the status bar. Alt-drag SHALL
select a rectangle whether the mode is on or off.

#### Scenario: Drag selects a rectangle

- **WHEN** column selection mode is on and the user drags across several lines
- **THEN** the selection is a rectangle — one cursor per line, the same columns

#### Scenario: The mode is visible

- **WHEN** column selection mode is on
- **THEN** the status bar shows it, and selecting that indicator turns it off

#### Scenario: The mode survives the file

- **WHEN** the user switches file or reopens the project with the mode on
- **THEN** the mode is still on

### Requirement: Keyboard Column Cursors

Reado SHALL let the user grow a rectangular selection from the keyboard, without
the pointer and without turning column selection mode on.

#### Scenario: Extend the rectangle down

- **WHEN** the user presses the column-cursor-down shortcut
- **THEN** a cursor is added on the line below at the same column, with the
  existing cursors kept

#### Scenario: Widen every cursor

- **WHEN** the user presses the column-cursor-right shortcut with several cursors
- **THEN** every cursor extends its selection by one character
