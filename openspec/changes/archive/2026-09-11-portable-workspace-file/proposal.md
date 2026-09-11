## Why

Reado opens several folders at once, and remembers which ones — in
`.reado/workspace.json` inside whichever folder happened to be primary. That
makes the workspace a property of one folder: it cannot be opened directly, it
cannot be committed as "how this project is worked on", and it cannot be handed to
a colleague. Open the second folder first and the workspace does not exist.

VS Code's `.code-workspace` is a file you open. That is the whole difference.

## What Changes

- A **workspace file** (`.reado-workspace`, JSON): the folders of the workspace,
  stored relative to the file wherever possible so it survives being committed and
  cloned somewhere else.
- **Save Workspace As…** writes it; **Open Workspace…** opens it; both from the
  File menu and the command palette. Opening one opens every folder it names, with
  the first as primary.
- Opening a `.reado-workspace` from the OS — double click, `open` on the command
  line, the argv Reado is launched with — opens the workspace rather than showing
  the file as text.
- The window remembers it was opened from a workspace file, so adding or removing
  a folder writes back to that file instead of to a folder's `.reado/`.
- `.reado/workspace.json` keeps working exactly as it does: it is what a folder
  opened directly still uses.

## Capabilities

### Added Capabilities

- `project-workspace`: a portable workspace file that can be saved, opened,
  committed and shared.
