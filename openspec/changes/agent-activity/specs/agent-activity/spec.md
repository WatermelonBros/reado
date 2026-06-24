## ADDED Requirements

### Requirement: Live Agent Change Feed
Reado SHALL surface agent file changes as they happen, deriving a live,
newest-first feed of touched files from the existing file watcher while a review
is in flight. Rapid edits to the same file SHALL coalesce into a single rolling
entry recording its path, change kind (create, modify, delete), and last-touched
time.

#### Scenario: Agent edits a file during a review
- **WHEN** a review has been dispatched and the agent modifies a file in the project
- **THEN** an activity entry for that file appears (or updates) at the top of the feed with kind "modify" and a fresh last-touched time

#### Scenario: Rapid edits coalesce
- **WHEN** the agent writes to the same file several times in quick succession
- **THEN** the feed shows a single rolling entry for that file rather than one entry per write

#### Scenario: No review in flight
- **WHEN** files change but no review has been dispatched
- **THEN** the change is not attributed as agent activity and does not enter the feed

### Requirement: Map Changes To Likely Comments
Reado SHALL map each changed file to the open or dispatched comment(s) anchored
in it and present them as the comment(s) the change likely resolves. The link
SHALL be advisory and clearly labeled as a likelihood; Reado SHALL NOT mark the
comment as resolved or otherwise mutate comment state from this surface.

#### Scenario: Change has anchored comments
- **WHEN** a changed file has open comments anchored in it
- **THEN** the activity entry lists those comment(s) as the ones it likely resolves, labeled as likely (not "resolved")

#### Scenario: Change has no anchored comments
- **WHEN** a changed file has no open comments anchored in it
- **THEN** the activity entry is shown without a comment link

### Requirement: Navigable Activity Panel
Reado SHALL provide an `activity` side-panel Tool that lists recent agent
activity newest-first and lets the user navigate from any entry to the change.
Selecting an entry SHALL open the file, revealing the changed lines or the mapped
comment when known.

#### Scenario: Open the panel
- **WHEN** the user selects the Activity tool in the sidebar
- **THEN** the panel shows recent agent activity newest-first, or a calm empty state when there is none

#### Scenario: Navigate to a change
- **WHEN** the user clicks an activity entry
- **THEN** Reado opens that file and reveals the changed lines or its mapped comment

### Requirement: Honest Read-Only Surface
The Agent Activity panel SHALL be strictly read-only: it reports state and offers
only navigation. The panel SHALL NOT expose any control that sends input to,
starts, stops, or otherwise drives the agent.

#### Scenario: No agent-driving controls
- **WHEN** the user interacts with the Activity panel
- **THEN** the only available actions are viewing entries and navigating to changes or comments, with no action that drives or controls the agent
