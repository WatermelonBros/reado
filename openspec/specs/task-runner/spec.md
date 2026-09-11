# task-runner Specification

## Purpose
TBD - created by archiving change 2026-09-11-task-runner. Update Purpose after archive.
## Requirements
### Requirement: Project Tasks

Reado SHALL read named tasks from `.reado/tasks.json`, and from
`.vscode/tasks.json` when Reado's own file is absent, so a project that already
describes its commands needs no second copy. A task SHALL carry a `label` and a
`command`, and MAY carry `args`, `cwd` (relative to the project) and `group`
(`build` or `test`).

A tasks file that does not parse SHALL be reported with its problem, and SHALL
leave any previously loaded tasks alone.

#### Scenario: Tasks are offered

- **WHEN** a project defines tasks and the user opens the task list
- **THEN** each task's label is offered, and choosing one runs it

#### Scenario: VS Code's file is enough

- **WHEN** a project has `.vscode/tasks.json` and no `.reado/tasks.json`
- **THEN** its tasks are offered

#### Scenario: A broken tasks file

- **WHEN** the tasks file cannot be parsed
- **THEN** Reado says so, naming the problem, and the tasks it already had stay

### Requirement: Running A Task

A task SHALL run in a terminal pane, so its output, its colours and any prompt it
shows behave exactly as they do when the command is typed by hand. The pane SHALL
be named for the task.

The build task SHALL be reachable with a single shortcut; the task list SHALL be
reachable from the command palette and the menu.

#### Scenario: A task runs where output belongs

- **WHEN** the user runs a task
- **THEN** a terminal pane named for that task opens and the command runs in it

#### Scenario: The build task has a shortcut

- **WHEN** the user presses the run-build-task shortcut and exactly one task is
  in the `build` group
- **THEN** that task runs without asking which

#### Scenario: No tasks defined

- **WHEN** the user asks for the task list in a project with no tasks file
- **THEN** Reado says there are none and offers to create the file

### Requirement: Output Becomes Problems

While a task runs, Reado SHALL match its output against problem matchers and add
what they find to the Problems panel: file, line, column when given, severity and
message. Each entry SHALL be clickable to that position, and SHALL be attributed
to the task that produced it.

Re-running a task SHALL replace the problems from its previous run, so the panel
describes the current state rather than every run since the project opened.

#### Scenario: An error becomes a clickable entry

- **WHEN** a running task prints a line a matcher recognises as an error
- **THEN** a problem appears with that file, line and message, and selecting it
  opens the file at that line

#### Scenario: A second run replaces the first

- **WHEN** a task that produced problems is run again and prints fewer
- **THEN** only the problems from the second run remain

#### Scenario: Output nothing recognises

- **WHEN** a task prints output no matcher recognises
- **THEN** no problems are added, and the output is still in the terminal
