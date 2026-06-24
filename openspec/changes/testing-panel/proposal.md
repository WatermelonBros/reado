## Why

Reading code is incomplete without knowing what is *verified*. A read-first IDE
should answer, at a glance, "what does this test, and is it passing?" — yet Reado
has no view of the project's tests. Today the only way to know coverage or a
failing case is to leave the reader, drop into a raw terminal, and remember the
right incantation per framework. That breaks the calm reading flow and hides
state the reader most wants while orienting in unfamiliar code.

A testing panel closes that gap on the read-first axis: discover the tests that
exist, run a single test / a file / the whole suite through the existing
terminal/PTY, and see honest pass/fail status with a way to jump straight to a
failing test's location in the editor. It also feeds the comment↔AI loop — a
red test is exactly the kind of thing you annotate with a comment for the agent
to resolve. Surfaces stay honest (real runner output, real status, never a
fabricated green), and framework detection is deliberately pragmatic and
extensible so adding a runner later is a small, additive step rather than a
rewrite.

## What Changes

- A new side-panel **Tests** tool: add `"tests"` to `Tool` in
  `src/lib/store.ts` and register its sidebar entry/icon alongside the existing
  tools, so tests live next to files/search/outline/git.
- A `TestsPanel` organism (`src/components/organisms/TestsPanel.tsx`) that shows
  a discovered test tree (suite → file → test), per-node pass/fail/unknown
  status with honest empty/loading/stale states, and run controls (run one /
  run file / run all / re-run failed), styled with the calm semantic tokens
  (`bg-surface`, `border-line`, `text-ink/muted/faint`, `accent`).
- A test-discovery module (`src/lib/tests.ts`) with an **extensible framework
  registry**: each entry detects its framework from project config/conventions
  (e.g. `package.json` scripts/devDeps for Vitest/Jest, `Cargo.toml` for
  `cargo test`, `pytest.ini`/`pyproject.toml` for pytest, `go.mod` for
  `go test`) and yields the command to run a test / file / all plus a result
  parser. Detection is best-effort and ranked; nothing mandates a specific
  runner.
- Rust-side discovery helpers as needed in a small `src-tauri/src/tests.rs`
  (glob test files by convention, read config markers) reusing the existing
  `.reado`/index plumbing; no new long-lived process model — runs go through
  the existing PTY.
- Execution via the **existing terminal/PTY** (`src-tauri/src/pty.rs`,
  `src/lib/terminals.ts`): a run spawns the framework command in a terminal
  pane (honest, real output the user can scroll), and Reado captures the run's
  output to derive pass/fail status and per-test results by parsing the
  framework's reporter output.
- **Jump to location**: parsed failures carry `file:line` so clicking a failing
  test opens it in the editor (reuse the existing open-file / go-to-line path
  used by diagnostics and definition/peek).
- A per-project results cache under the project's `.reado/tests/` directory so
  the last known status is shown instantly on re-open, with honest staleness
  when files change after the last run.
- i18n strings for the panel (run, run file, run all, re-run failed, passing,
  failing, not run, discover) in EN + IT
  (`src/i18n/locales/en.json` / `it.json`).

## Capabilities

### Added Capabilities
- `testing-panel`: discover, run (via the terminal/PTY), and read project test
  results with pass/fail status and jump-to-location, behind extensible
  framework detection.

## Out of Scope

- Mandating or bundling a specific test runner, or installing one for the user.
- A custom in-app test executor or daemon separate from the existing PTY.
- Coverage instrumentation/visualization (line-level coverage gutters).
- Editing or generating tests (that remains the comment↔AI loop's job).
- Watch-mode orchestration and flaky-test retries/quarantine.
- Debugger integration / breakpoints.
