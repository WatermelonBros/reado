## 1. The file

- [x] 1.1 Read `.reado/tasks.json`, falling back to `.vscode/tasks.json`; tolerate
      comments and trailing commas, which both files have in the wild.
- [x] 1.2 A parse failure is reported and changes nothing.

## 2. Running

- [x] 2.1 Run in a terminal pane named for the task — reuse the pane the task
      last ran in rather than opening one per run.
- [x] 2.2 Palette + Terminal menu + ⇧⌘B for the single `build` task.
- [x] 2.3 With no tasks file, offer to write a starter one.

## 3. Problems

- [x] 3.1 Matchers for tsc, eslint, cargo and a generic `file:line:col: msg`.
- [x] 3.2 Feed the Problems panel, attributed to the task, replacing that task's
      previous run.

## 4. Verify

- [x] 4.1 Unit tests: the two file locations, a broken file, each matcher, the
      replace-on-rerun rule, the build shortcut with one and with several.
- [x] 4.2 i18n for every shipped locale.
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
