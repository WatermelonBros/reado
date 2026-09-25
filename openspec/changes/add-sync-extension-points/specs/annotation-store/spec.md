## ADDED Requirements

### Requirement: Comment file format as a public API

The comment store SHALL expose, to code linking the store, functions that parse the
text of a comment file into its metadata and thread and render metadata and thread
back into that exact format, so that tools working on comment files (such as a sync
engine) never re-implement the format. Rendering what was parsed SHALL reproduce an
equivalent file.

#### Scenario: Round trip

- **WHEN** a comment file is parsed and the result rendered again
- **THEN** parsing the rendered text gives the same metadata and the same thread
