## ADDED Requirements

### Requirement: Add And Remove Bookmarks
The user SHALL be able to toggle a reading bookmark on the active line or the
selected region without writing any annotation, from the gutter and from a
command. Toggling an existing bookmark SHALL remove it.

#### Scenario: Add a bookmark
- **WHEN** the user toggles a bookmark on a line that has none
- **THEN** the line is bookmarked and a quiet gutter marker appears, with no
  annotation requested

#### Scenario: Remove a bookmark
- **WHEN** the user toggles a bookmark on a line that is already bookmarked
- **THEN** the bookmark and its gutter marker are removed

#### Scenario: Bookmark a region
- **WHEN** the user toggles a bookmark with a multi-line selection
- **THEN** the selected region is bookmarked and can be jumped to and removed as
  one bookmark

### Requirement: Quiet Gutter Marker Distinct From Comments
Reado SHALL mark bookmarked lines with a quiet gutter marker that is visually
distinct from the comment gutter marker, so a bookmark never reads as review
state.

#### Scenario: Bookmark marker shown
- **WHEN** a file with bookmarks is open
- **THEN** each bookmarked line shows the bookmark marker in the gutter

#### Scenario: Distinct from a comment
- **WHEN** a line carries both a comment and a bookmark
- **THEN** the bookmark marker is rendered distinctly from the comment marker and
  is not mistaken for review state

### Requirement: List And Jump
Reado SHALL provide a way to list this project's bookmarks and jump to any of
them, both in a side panel and via the command palette / Command Center.

#### Scenario: Jump from the panel
- **WHEN** the user clicks a bookmark in the bookmarks panel
- **THEN** Reado opens that file and places the cursor at the bookmarked line

#### Scenario: Jump from the palette
- **WHEN** the user opens the bookmark mode of the command palette and picks a
  bookmark
- **THEN** Reado jumps to that bookmark without opening the panel

#### Scenario: Empty state
- **WHEN** the project has no bookmarks
- **THEN** the panel shows a quiet empty state rather than an error

### Requirement: Persisted Per Project, Not An AI Artifact
Reading-bookmark state SHALL live under the project's `.reado/` folder
(gitignored by default) so it is personal and survives restarts, and bookmarks
SHALL never be dispatched to an AI agent or surfaced as comments.

#### Scenario: Survives restart
- **WHEN** the project is reopened
- **THEN** previously created bookmarks are still present and marked

#### Scenario: Never sent to an agent
- **WHEN** the user runs Send Review or any agent dispatch
- **THEN** no bookmark is included and bookmarks remain absent from the comments
  panel
