> Implemented as a **test launcher**: Reado discovers the framework and runs the
> command in the integrated terminal, which is the results surface (consistent with
> Reado's terminal-centric, agent-friendly model and "honest, never fabricate
> status"). In-panel pass/fail parsing + jump-to-failure is a deliberate non-goal
> for now — the terminal shows the real, unparsed output.

## 1. Discovery (extensible, by convention)

- [x] 1.1 `detectRunners` (src/lib/tests.ts) detects runners from manifests/lockfiles:
      JS (package.json `test` script + pnpm/yarn/bun/npm), Rust (Cargo.toml), Go
      (go.mod), Python (pyproject/pytest.ini/setup.cfg). Easy to extend.

## 2. Run (via the terminal/PTY)

- [x] 2.1 "Run all" runs the suite command; "Run current file" runs the file's
      tests where the framework supports a path filter — both via `runInTerminal`.

## 3. Panel

- [x] 3.1 `tests` Tool + `TestsPanel` lists detected runners with run actions and a
      note that output appears in the terminal; ActivityBar entry when detected;
      palette command. Calm empty state.

## 4. Results surface

- [x] 4.1 Results appear in the integrated terminal (honest, unparsed). In-panel
      pass/fail + jump-to-failure: deliberate non-goal (see header).

## 5. Verify

- [x] 5.1 EN + IT (`tests.*`); typecheck + cargo check + build green.
