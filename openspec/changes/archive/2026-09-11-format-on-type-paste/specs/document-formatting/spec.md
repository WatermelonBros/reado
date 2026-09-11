## ADDED Requirements

### Requirement: Format on paste

When Format on Paste is enabled, Reado SHALL re-indent text pasted into the
editor so it matches the indentation of the place it lands, preserving the
relative indentation inside the pasted block, and SHALL leave the rest of the
document untouched. The paste and its re-indentation SHALL be a single undo step.

#### Scenario: Pasting an indented block

- **WHEN** the user pastes a block copied from a deeper nesting level into a
  shallower one
- **THEN** the block is re-indented to its new position, keeping its internal
  structure

#### Scenario: Undo takes back one thing

- **WHEN** the user undoes after a re-indented paste
- **THEN** both the paste and the re-indentation are undone together

#### Scenario: Pasting inside a line

- **WHEN** the user pastes a fragment into the middle of an existing line
- **THEN** nothing is re-indented

#### Scenario: Disabled

- **WHEN** Format on Paste is off
- **THEN** pasted text is inserted exactly as it was copied

### Requirement: Format on type

When Format on Type is enabled and the language server advertises on-type
formatting, Reado SHALL ask the server to format after the user types one of the
trigger characters the server names, and SHALL apply the edits it returns.

#### Scenario: Closing a block

- **WHEN** the user types a closing brace on a line the server wants to re-indent
- **THEN** the line is re-indented as the server asks

#### Scenario: No server support

- **WHEN** no server is attached, or the server does not offer on-type formatting
- **THEN** typing behaves exactly as it does today, with no request sent

#### Scenario: Only trigger characters

- **WHEN** the user types a character the server did not name as a trigger
- **THEN** no formatting request is sent

#### Scenario: Disabled

- **WHEN** Format on Type is off
- **THEN** no on-type formatting request is ever sent
