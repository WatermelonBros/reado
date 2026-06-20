## ADDED Requirements

### Requirement: Generated Documentation
Reado SHALL generate base documentation views from the history of comments (active and archived), summarizing what was observed and resolved across the codebase.

#### Scenario: Generate documentation
- **WHEN** the user opens the documentation view for a project
- **THEN** Reado presents documentation derived from the comment history

### Requirement: Documentation Filtering
The documentation views SHALL be filterable (e.g. by file, period, type).

#### Scenario: Filter documentation
- **WHEN** the user filters documentation by file
- **THEN** only entries related to that file are shown
