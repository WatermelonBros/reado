> Read-first, additive, honest: nothing fabricates status. A run is just the
> framework's own command in the existing PTY; Reado only discovers, runs, and
> parses. Mandating a runner is out of scope — detection is a ranked registry.

## 1. Discovery & framework registry

- [ ] 1.1 Create `src/lib/tests.ts` with a `Framework` shape: `id`, `detect(project)`, `runAll`, `runFile(path)`, `runOne(path, name)`, and `parse(output) -> TestResult[]`.
- [ ] 1.2 Seed the registry with pragmatic detectors: Vitest/Jest (`package.json` scripts + devDeps), `cargo test` (`Cargo.toml`), pytest (`pyproject.toml`/`pytest.ini`), `go test` (`go.mod`); rank when several match and let detection be best-effort.
- [ ] 1.3 Add Rust discovery helpers in `src-tauri/src/tests.rs` (glob test files by convention, read config markers), reusing the existing `.reado`/index plumbing; expose via a Tauri command.
- [ ] 1.4 Build the discovered test tree (suite → file → test) from globbed files + framework hints; honest empty state when no framework is detected.

## 2. Panel UI

- [ ] 2.1 Add `"tests"` to `Tool` in `src/lib/store.ts` and register its sidebar entry + icon next to the other tools.
- [ ] 2.2 Create `TestsPanel` organism (`src/components/organisms/TestsPanel.tsx`): test tree with per-node status (passing / failing / not-run / running), calm tokens, and empty/loading/stale states.
- [ ] 2.3 Run controls: run one, run file, run all, re-run failed; controls reflect run-in-progress state.

## 3. Execution via PTY & status capture

- [ ] 3.1 A run spawns the framework command in a terminal pane via the existing PTY (`src-tauri/src/pty.rs`, `src/lib/terminals.ts`) — real, scrollable output.
- [ ] 3.2 Capture the run's output and feed it to the framework's `parse()` to derive pass/fail and per-test results; map results back onto the tree honestly (unknown stays unknown).

## 4. Jump to location & cache

- [ ] 4.1 Parsed failures carry `file:line`; clicking a failing test opens the file at that line via the existing open-file / go-to-line path (as used by diagnostics / definition).
- [ ] 4.2 Persist last-known results under `.reado/tests/`; show them instantly on re-open with an honest "may be out of date" indicator when files changed since the run.

## 5. i18n

- [ ] 5.1 Add panel strings (run, run file, run all, re-run failed, passing, failing, not run, discover, no framework detected) to `src/i18n/locales/en.json` and `it.json`.

## 6. Verify

- [ ] 6.1 typecheck (`tsc`) + `cargo check` + build green.
- [ ] 6.2 Manual: discover in a JS and a Rust project, run all/file/one, confirm honest status and that clicking a failure jumps to its location.
