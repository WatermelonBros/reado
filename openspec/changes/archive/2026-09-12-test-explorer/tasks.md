## 1. Discovery

- [x] 1.1 `discover_tests`: gitignore-aware walk (`require_git(false)`, so a
      project that is not a repository still honours its ignore file), bounded by
      file size and total count.
- [x] 1.2 Per-framework extraction: JS suites/tests with nesting, Rust through
      `#[test]`-style attributes, Python `def test_` with its class, Go `TestX`.
- [x] 1.3 Each file's last-modified time, for the staleness check — from the
      `metadata` call the size check already makes.

## 2. Running

- [x] 2.1 A runner per framework: the command for a test / a file / everything,
      and the parser for that framework's output.
- [x] 2.2 One reused terminal pane; tests in scope marked running until the
      output says otherwise.
- [x] 2.3 Verdicts persisted per project root and restored on open.

## 3. UI

- [x] 3.1 `TestsPanel`: the tree, a filter, run controls at every level, and the
      empty state naming what is looked for.
- [x] 3.2 A `tests` tool in the rail, present once the project has tests (loaded
      with the project, not by the panel that the load reveals).
- [x] 3.3 `testGutter`: the run arrow, tinted by the last verdict.
- [x] 3.4 A stale verdict drawn faded, and labelled.
- [x] 3.5 A palette command that runs everything.

## 4. Verify

- [x] 4.1 Rust tests for each extractor and for the walk — relative paths, a
      file that looks like tests and declares none, and an ignored directory.
- [x] 4.2 Unit tests for every runner's command and output parser, including
      ANSI-dressed lines and a name containing brackets.
- [x] 4.3 Unit tests for the staleness rule.
- [x] 4.4 i18n for all five shipped locales.
- [x] 4.5 CHANGELOG entry under `[Unreleased]`.
- [x] 4.6 Driven in the running app: the rail entry, the tree, a real run, and
      the verdicts landing on the tree and the gutter. Four things only the
      running app could show, each now pinned by a test:
      - vitest's default reporter names only the *failures*, so every passing
        test sat at "never run" — the runners ask for the verbose reporter.
      - jest's failure glyph is a different character from vitest's, and both
        append a duration in a shape the name has to be stripped of.
      - PTY output is base64-framed; the matcher was reading the frame. (The
        task runner's problem matcher had the same bug, and never matched.)
      - A command written into a pane whose shell has not spawned yet is
        discarded in silence.
- [x] 4.7 Coverage checked by mutation: each of the six defects found in the
      running app was put back, one at a time, and the suite re-run. All six now
      fail it — three did not at first, and got a test each (the pane-write wait,
      the rebase plan's merge commits, and an i18n check that every `t(key, …)`
      call passes the placeholders its string declares).
