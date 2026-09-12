## Why

`testing-panel` was specified and then built as a launcher — two buttons that ran
the suite, or the current file, in a terminal. It was removed as incomplete, and
the spec stayed: the requirements describe a Test Explorer that has never
existed. Today a project's tests are still found by reading the terminal.

Two of those requirements also assumed a shape the implementation should not
have. Detecting *the* framework per project is wrong in a repository with more
than one — this one has Rust and TypeScript tests side by side — and detecting it
from configuration means a project whose dependencies are not installed shows
nothing at all. What identifies a test file is the same thing every one of these
frameworks uses to identify it: its name.

## What Changes

- **Discovery by reading the source**, per file rather than per project:
  vitest/jest, `cargo test`, pytest and `go test`, each recognised by the shapes
  it is written in. The list exists before anything is installed, and a monorepo
  gets all of its frameworks at once.
- **A tree of file → test**, each test carrying the suites that enclose it.
- **Run all, run a file, run one test**, in a terminal pane, with the verdict
  parsed off the output as it goes past.
- **A run arrow in the editor's gutter** on every line that declares a test,
  tinted by how that test last went.
- **Verdicts remembered per project**, restored on re-open, and shown as
  out of date once the file they judged has changed since the run.

## Capabilities

### Modified Capabilities

- `testing-panel`: discovery per file by convention, the tree's shape, per-test
  running, the gutter arrow, and remembered verdicts with staleness.

## Impact

- New `src-tauri/src/testing.rs` (`discover_tests`), new `src/lib/testing.ts`
  (runner registry + result matchers), `src/lib/testGutter.ts`, `TestsPanel`.
- A `tests` tool in the activity rail, shown once the project has tests.
- Discovery is regex per framework and infers suite nesting from indentation:
  the list is a starting point, and the framework stays the authority on what
  exists — running a test asks it by name.
