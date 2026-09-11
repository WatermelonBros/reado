## ADDED Requirements

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
