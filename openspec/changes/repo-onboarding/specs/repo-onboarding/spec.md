## ADDED Requirements

### Requirement: Repo-Level Overview
Reado SHALL generate a repo-level overview that summarizes the project's
architecture, its entry points, and its key modules/directories with one-line
roles and how they connect. The overview SHALL be repo-level and distinct from
single-file synopsis/explanation.

#### Scenario: Generate an overview
- **WHEN** the user invokes "Generate repo overview" for the open project
- **THEN** the agent is asked (via the existing agent contract) for a repo-level
  overview covering a short summary, the architecture, entry points, and key
  modules/directories with their roles and connections

#### Scenario: Repo-level, not file-level
- **WHEN** the overview is produced
- **THEN** it describes the repository as a whole (entry points, modules, how
  they connect), not the contents of a single selected file

### Requirement: Explicit Generation
Reado SHALL generate the overview only on an explicit user action and SHALL NOT
generate or refresh it automatically or in the background.

#### Scenario: No overview until requested
- **WHEN** a project is opened and no cached overview exists
- **THEN** the Onboarding panel shows an empty state with a "Generate repo
  overview" action and generates nothing on its own

#### Scenario: User triggers generation
- **WHEN** the user explicitly triggers generation from the panel or command
  palette
- **THEN** generation runs, and only then

### Requirement: Cached and Regenerable
Reado SHALL cache the generated overview under the project's `.reado/` directory
so it is available without regenerating, and SHALL allow the user to regenerate
it on demand, replacing the cached copy.

#### Scenario: Reuse the cache
- **WHEN** the user reopens a project that already has a cached overview
- **THEN** the Onboarding panel shows the cached overview without calling the
  agent

#### Scenario: Regenerate
- **WHEN** the user invokes "Regenerate"
- **THEN** the overview is generated again and the cached copy under `.reado/` is
  replaced

### Requirement: Navigable Links
The overview SHALL present each entry point and key module/directory as a
navigable link that opens the referenced file or reveals the directory in the
file tree, and these anchors SHALL be stable enough to be referenced from a
reading-tour.

#### Scenario: Open a referenced file
- **WHEN** the user activates an entry-point or module link in the overview
- **THEN** Reado opens that file (or reveals that directory in the tree)

#### Scenario: Referenced from a tour
- **WHEN** a reading-tour references an overview entry point or module
- **THEN** that anchor resolves to the same file/directory the overview links to

### Requirement: Honest Staleness
Reado SHALL record when the overview was generated and the commit/HEAD it was
generated against, SHALL surface this in the panel, and SHALL flag the overview
as possibly stale when HEAD has moved — without auto-regenerating it.

#### Scenario: Surface provenance
- **WHEN** a cached overview is shown
- **THEN** the panel shows when it was generated and against which commit

#### Scenario: Flag staleness
- **WHEN** HEAD has moved since the overview was generated
- **THEN** the panel flags it as possibly stale and offers Regenerate, but does
  not regenerate automatically
