## ADDED Requirements

### Requirement: Semantic Index Build & Storage
Reado SHALL build a semantic embeddings index of the project, chunked by
symbol/file, and store the vectors and chunk metadata under the project's
`.reado/` directory. The index build SHALL be triggered explicitly by the user,
never silently. The embedding backend (local or external) is unspecified, but
each chunk record SHALL retain its file path, line range, and a content
fingerprint.

#### Scenario: Build the index on explicit request
- **WHEN** the user invokes "Build index" with no existing index
- **THEN** Reado chunks the project, embeds each chunk, and writes the vectors and metadata under `.reado/`

#### Scenario: Index is a rebuildable cache
- **WHEN** the `.reado/` semantic index files are deleted
- **THEN** no authoritative data is lost and a subsequent build fully reconstructs the index from project files

#### Scenario: No silent indexing
- **WHEN** the project is opened without an existing index
- **THEN** Reado does not start embedding automatically and waits for an explicit build action

### Requirement: Natural-Language Query with Ranked, Navigable Results
Reado SHALL accept a natural-language query, embed it, and return code locations
ranked by semantic similarity to that query. Each result SHALL include a file
path, line range, and a code snippet, and SHALL be navigable to open the file at
that location like existing search results.

#### Scenario: Conceptual query returns ranked locations
- **WHEN** the user enters a natural-language query such as "where do we handle auth?" against a built index
- **THEN** Reado returns the most semantically similar code locations, ordered by relevance, each with a snippet

#### Scenario: Open a result
- **WHEN** the user selects a semantic result
- **THEN** the file opens at the result's line range, reusing the existing search-result navigation

#### Scenario: Query without an index
- **WHEN** the user runs a semantic query and no index exists
- **THEN** Reado reports that the index is absent and offers to build it instead of returning empty results

### Requirement: Index Freshness & Incremental Refresh
Reado SHALL report the freshness of the semantic index and MUST NOT present a
stale result as current. The index SHALL be detectable as stale when project
files have changed since it was built, and a refresh SHALL re-embed only the
chunks whose source changed (with deleted files' chunks removed).

#### Scenario: Stale index is labelled
- **WHEN** project files have changed since the index was last built
- **THEN** Reado marks the index as stale and labels semantic results as potentially out of date

#### Scenario: Incremental refresh
- **WHEN** the user refreshes a stale index
- **THEN** Reado re-embeds only changed chunks, removes chunks for deleted files, and updates the last-built freshness metadata

#### Scenario: Fresh index reported honestly
- **WHEN** the index covers the current state of all project files
- **THEN** Reado reports the index as up to date with its last-built time

### Requirement: Search Panel Integration
Reado SHALL integrate semantic search into the existing search panel as an
additive mode alongside text and symbol search, exposing the index state and an
explicit build/refresh action. The semantic mode SHALL not replace existing
search and SHALL render results consistently with the existing results UX.

#### Scenario: Switch to semantic mode
- **WHEN** the user opens the search panel and selects the semantic mode
- **THEN** a natural-language query input and the current index state are shown, with text and symbol search still available

#### Scenario: Build/refresh from the panel
- **WHEN** the user triggers "Build / Refresh index" from the search panel
- **THEN** the panel shows building progress and then the resulting index state (built or stale)
