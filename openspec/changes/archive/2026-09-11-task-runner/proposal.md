## Why

Every project has four or five commands everyone runs — build, lint, test, watch
— and today each is typed into the terminal from memory, per person, per day.
Worse, when one of them fails, its output is a wall of text: the compiler names a
file and a line, and the reader has to find them by hand.

VS Code answers both with `tasks.json` and a **problem matcher**: the commands
are written down once and run from a shortcut, and their output is parsed into
entries you click to land on the error. That parse is the point — it is the
bridge between "the build failed" and "here is the line".

## What Changes

- `.reado/tasks.json` (and `.vscode/tasks.json`, which projects already have):
  named commands with a `label`, a `command`, optional `args`, `cwd` and `group`.
- Run one from the palette, from the Terminal menu, or with ⇧⌘B for the build
  task. It runs in a real terminal pane — the same terminals Reado already has,
  so output, colour and interaction are what they always were.
- A problem matcher turns the output into Problems-panel entries, clickable to
  the file and line, attributed to the task that produced them. Built-in matchers
  for the common shapes (tsc, eslint, cargo, generic `file:line:col: message`).
- Re-running a task replaces its previous problems rather than piling up.

## Capabilities

### Added Capabilities

- `task-runner`: project tasks, running them, and turning their output into
  problems.
