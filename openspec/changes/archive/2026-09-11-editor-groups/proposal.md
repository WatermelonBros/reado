## Why

Reado shows two files at once and no more: there is a primary pane and one split
(`store.ts`, `splitPath`). That is enough to compare two things and not enough
for the ordinary case of reading code — the test, the implementation and the type
it uses are three files, and the third one has to keep replacing one of the other
two.

The split is also not a real pane: it has no tab strip and no history of its own,
so the file in it can only be replaced, never navigated.

## What Changes

- N editor groups, laid out in a row, each a real pane: its own tabs, its own
  active file, its own back/forward history.
- ⌘1 / ⌘2 / ⌘3 … focus a group. Splitting the active editor makes a new group to
  its right and moves — or copies — the file into it.
- Closing a group's last tab closes the group and hands focus to its neighbour;
  the last remaining group never closes.
- Groups are part of the session, so a three-pane arrangement survives reopening
  the project.
- The existing split is this feature with two groups, so nothing a user has today
  is taken away.

## Capabilities

### Added Capabilities

- `editor-groups`: more than two panes, each with its own tabs and history.
