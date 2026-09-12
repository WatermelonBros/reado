# testing-panel Specification

## Purpose
TBD - created by archiving change testing-panel. Update Purpose after archive.
## Requirements
### Requirement: Test Discovery
Reado SHALL discover the project's tests by reading the source for the shapes
tests are written in, and present them in the Tests side panel as a tree of file
→ test, each test labelled with the suites that enclose it. Discovery SHALL NOT
require a framework to be installed, a dependency tree to be present, or the user
to name a runner.

The tree is keyed by file rather than by suite because a suite name is not unique
across files, and the file is what the reader navigates by.

When the project contains no recognisable tests, Reado SHALL show an honest empty
state naming the shapes it looks for, rather than an empty or invented tree.

#### Scenario: Discover tests in a supported project
- **WHEN** the user opens the Tests panel in a project containing test files
- **THEN** those files and their tests are listed as a tree, each test with no
  verdict until it is run

#### Scenario: No framework detected
- **WHEN** the project contains no recognisable tests
- **THEN** the panel shows an honest empty state, naming the shapes it looks for,
  and does not fabricate a test tree

#### Scenario: Nothing installed
- **WHEN** the project's dependencies have never been installed
- **THEN** the tests are still listed, because the list was read from the source

#### Scenario: Ignored directories
- **WHEN** the project ignores a directory that contains test files of its own
- **THEN** those tests are not listed, whether or not the project is a git
  repository

### Requirement: Run Tests Through The Terminal
Reado SHALL run one test, one file's tests, or everything, by running the
framework's own command in a terminal pane, so that colour, progress and stack
traces read exactly as they do when the command is typed by hand. Reado SHALL NOT
fabricate or simulate a run. A test SHALL also be runnable from the editor, via a
run control in the gutter beside the line that declares it.

Runs SHALL reuse one pane rather than opening one per run.

#### Scenario: Run the whole suite
- **WHEN** the user invokes "Run all"
- **THEN** each present framework's suite command runs in a terminal pane and its
  real output is shown

#### Scenario: Run a single test
- **WHEN** the user invokes run on one test
- **THEN** the framework command scoped to that test — by file and name, in that
  framework's own filter syntax — runs in the terminal and its real output is
  shown

#### Scenario: Run from where it is written
- **WHEN** the user clicks the run control in the gutter beside a test
- **THEN** that test alone is run

### Requirement: Honest Pass/Fail Results
Reado SHALL derive a verdict per test by parsing the framework's output and show
it against that test, leaving any test the output did not name in its previous
state rather than asserting one. Output arrives through a real terminal, so a
parser SHALL read past the colour the framework writes.

Verdicts SHALL be kept per project and restored when it is re-opened, and a
restored verdict SHALL be shown as possibly out of date once the file it judged
has changed since the run — a tick against code edited afterwards is a claim
about a file that no longer exists.

#### Scenario: Reflect results after a run
- **WHEN** a run completes and its output is parsed
- **THEN** each test named by the output shows as passing, failing or skipped,
  and tests the run did not cover keep the state they had

#### Scenario: Stale cached results
- **WHEN** the project is re-opened and a test's file has changed since that test
  last ran
- **THEN** its verdict is shown as out of date rather than as current

#### Scenario: Colour in the output
- **WHEN** the framework writes its results with terminal colour
- **THEN** the verdicts are read anyway, and a test whose name contains brackets
  is not mangled by the reading

### Requirement: Jump To A Test Location
Reado SHALL let the user jump from a test (especially a failing one) to its
location in the editor, opening the file at the parsed `file:line` using the
existing open-file / go-to-line path.

#### Scenario: Jump to a failing test
- **WHEN** the user clicks a failing test that has a parsed location
- **THEN** the editor opens that file and scrolls to the test's line

### Requirement: Per-File Framework Recognition
Reado SHALL recognise a test file's framework from the file itself — its name and
the shapes inside it — so that one project may carry several frameworks at once
and each file is run by the one that owns it.

Support for each framework SHALL be one registry entry contributing the commands
to run a test, a file or everything, and a parser for that framework's output, so
that adding a framework is additive.

#### Scenario: Two frameworks in one project
- **WHEN** a project holds both `*.test.ts` files and Rust `#[test]` functions
- **THEN** both are listed, and each is run by its own framework's command

#### Scenario: Add a new framework
- **WHEN** a registry entry is added with its commands and its output parser
- **THEN** discovery, running and result parsing for that framework work without
  changes to the panel or the run path beyond the registry entry

