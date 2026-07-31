## ADDED Requirements

### Requirement: Test Discovery
Reado SHALL discover the project's tests by convention and configuration and
present them as a tree (suite → file → test) in the Tests side panel, without
requiring the user to specify the runner. When no supported framework is
detected, Reado SHALL show an honest empty state rather than an empty or
misleading tree.

#### Scenario: Discover tests in a supported project
- **WHEN** the user opens the Tests panel in a project whose framework is detected
- **THEN** the discovered test files and tests are listed as a tree, each with a
  status of not-run until executed

#### Scenario: No framework detected
- **WHEN** the user opens the Tests panel in a project with no detectable test framework
- **THEN** the panel shows an honest "no test framework detected" empty state and
  does not fabricate a test tree

### Requirement: Extensible Framework Detection
Reado SHALL detect frameworks through an extensible registry where each entry
contributes detection, the commands to run a test / file / all, and a result
parser, so that adding a new framework is additive. Detection MAY match more
than one framework and SHALL rank them rather than mandating any specific runner.

#### Scenario: Detect from project configuration
- **WHEN** a project declares a framework via its config or conventions (e.g.
  devDependencies/scripts, `Cargo.toml`, `pyproject.toml`, `go.mod`)
- **THEN** the matching registry entry is selected and its run commands and parser
  are used for that project

#### Scenario: Add a new framework
- **WHEN** a new framework entry is added to the registry
- **THEN** discovery, running, and result parsing for that framework work without
  changes to the panel or execution code beyond the registry entry

### Requirement: Run Tests Through The Terminal
Reado SHALL run a single test, a single test file, or the whole suite by spawning
the framework's command in the existing terminal/PTY, so output is real and
scrollable. Reado SHALL NOT fabricate or simulate a test run.

#### Scenario: Run the whole suite
- **WHEN** the user invokes "Run all"
- **THEN** the framework's suite command runs in a terminal pane and its real
  output is shown

#### Scenario: Run a single test
- **WHEN** the user invokes run on one test
- **THEN** the framework command scoped to that test (file + name) runs in the
  terminal and its real output is shown

### Requirement: Honest Pass/Fail Results
Reado SHALL derive pass/fail status by parsing the framework's run output and map
it onto the test tree, keeping any node whose status cannot be determined as
unknown rather than asserting a result. The last known results SHALL be cached
per project and shown on re-open with an honest staleness indicator when files
changed after the run.

#### Scenario: Reflect results after a run
- **WHEN** a run completes and its output is parsed
- **THEN** each test's node shows passing or failing accordingly, and tests not
  covered by the run remain in their prior or unknown state

#### Scenario: Stale cached results
- **WHEN** the panel is reopened and the relevant files changed since the last run
- **THEN** the cached results are shown with an honest "may be out of date"
  indicator instead of being presented as current

### Requirement: Jump To A Test Location
Reado SHALL let the user jump from a test (especially a failing one) to its
location in the editor, opening the file at the parsed `file:line` using the
existing open-file / go-to-line path.

#### Scenario: Jump to a failing test
- **WHEN** the user clicks a failing test that has a parsed location
- **THEN** the editor opens that file and scrolls to the test's line
