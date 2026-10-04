## Purpose

Lets a project ship guided tours through its own code that anyone opening it in Reado
can walk, with no account and in any build.

## ADDED Requirements

### Requirement: Tours live in the repository

Reado SHALL load project tours from a `tour.json` file at the project root, in an
open, documented format that names no product: a format version and the project's
tours, each with an id, a name, an optional description, an optional onboarding
flag, and ordered steps. Each step SHALL point at a project file and
optionally at a span within it — whole lines, or an exact start and end (line and
column) — and SHALL carry a title and a markdown body, and optionally the exact code
of the span. Reado SHALL reload tours when the file changes, SHALL ignore a `tour.json` that
doesn't have the format's shape, and SHALL skip a tour it can't read, saying so
without interrupting the user.

#### Scenario: After a pull

- **WHEN** a `git pull` adds a tour to `tour.json`
- **THEN** the tour is available without reopening the project

#### Scenario: Broken tour

- **WHEN** one tour in `tour.json` is not valid
- **THEN** the other tours load and the tour list notes that one couldn't be read

#### Scenario: A different file named tour.json

- **WHEN** the project has a `tour.json` that isn't a tour file
- **THEN** Reado ignores it and shows no warning

#### Scenario: Written by another tool

- **WHEN** another editor wrote a valid `tour.json` with its own `x-` fields
- **THEN** Reado plays its tours and ignores those fields

### Requirement: The format is open

The tour file format SHALL be published as a specification and a JSON Schema that
anyone may use without permission, and SHALL name no product. It SHALL carry a major
version; readers SHALL ignore fields they don't know, and tools SHALL put their own
data under keys prefixed `x-`. Reado SHALL validate tour files with the schema it
publishes.

#### Scenario: Newer major version

- **WHEN** `tour.json` has a major version Reado doesn't know
- **THEN** Reado plays nothing from it and says the tours need a newer version of the
  format

#### Scenario: Additive field

- **WHEN** a tour has an optional field added in a later revision of version 1
- **THEN** Reado plays it, ignoring the field

#### Scenario: Paths outside the project

- **WHEN** a step points at `../../etc/hosts`
- **THEN** the step is not played and nothing outside the project is opened

### Requirement: Playing a tour

Reado SHALL play a project tour with Ark UI's Tour component, in every build and
without an account: for each step it SHALL open the file, scroll its span into view,
highlight exactly that span over a dimmed backdrop, and show the title and body in a
dialog beside it, with the position in the tour, back and next controls and keyboard
navigation. A whole-file step SHALL highlight the editor.

#### Scenario: Community build

- **WHEN** someone opens a repository with a project tour in the community build
- **THEN** they can play it

#### Scenario: Exact span

- **WHEN** a step points at line 41, columns 9 to 30
- **THEN** only those characters are highlighted

#### Scenario: Bounds

- **WHEN** the user is on the first or last step
- **THEN** "Back" is unavailable on the first, and the last offers "Done"

### Requirement: Steps follow the code

A step SHALL be located by the code it quotes before its line and column. A step
whose code can't be found SHALL show its file and say the code has changed, never
highlight unrelated code.

#### Scenario: Code moved

- **WHEN** the quoted code moved 40 lines down
- **THEN** the step highlights it at its new place

#### Scenario: Code gone

- **WHEN** the quoted code no longer exists
- **THEN** the step opens the file and says the code has changed since it was written

### Requirement: The project tour

When a tour is marked as the onboarding tour, a "Project tour" button SHALL appear at
the end of the editor tab bar and a command SHALL start it. Starting it again after
leaving part-way SHALL offer to continue, unless the tour changed. Opening a project
with nothing read in it SHALL offer the project tour, once. Other tours SHALL be
playable from the command palette.

#### Scenario: Button

- **WHEN** the user clicks "Project tour"
- **THEN** the onboarding tour plays from its first step

#### Scenario: Resume

- **WHEN** the user closed it at step 5 and starts it again
- **THEN** Reado offers to continue from step 5 or start over

#### Scenario: First open

- **WHEN** someone opens the project for the first time
- **THEN** Reado offers the project tour once

### Requirement: Walking a tour marks files read

Moving past a step SHALL mark its file read when it isn't already.

#### Scenario: Progress

- **WHEN** the user walks steps across five files
- **THEN** those five files show as read in the file tree

### Requirement: Extension points for authoring

The core SHALL let an embedding build register a panel and items in the editor's
context menu; the community build registers none.

#### Scenario: Community build

- **WHEN** the community build runs
- **THEN** no extra panel or menu item appears
