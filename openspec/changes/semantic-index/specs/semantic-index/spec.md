## ADDED Requirements

### Requirement: Persisted incremental relevance index

Reado SHALL maintain a persisted, incremental index of the project's symbols,
file paths, and knowledge-base text, kept fresh as files change, so relevance
queries do not re-scan the project each time. The index SHALL be a rebuildable
cache (never authoritative) that can be dropped and regenerated.

#### Scenario: Index survives and updates

- **WHEN** a project is reopened and then a file changes
- **THEN** queries use the persisted index and the changed file's entries refresh
  without a full rebuild

#### Scenario: Rebuildable

- **WHEN** the index file is missing or corrupt
- **THEN** Reado rebuilds it from the project without data loss elsewhere

### Requirement: Instant ranked query

Reado SHALL answer a relevance query from the local index with ranked results
returned as the user types (no fixed multi-second wait), boosting symbol and
identifier matches over incidental text.

#### Scenario: Instant results

- **WHEN** the user types a query in semantic search
- **THEN** ranked local results appear immediately and update as the query changes

#### Scenario: Symbol matches rank first

- **WHEN** a query matches a declared symbol and also appears in prose
- **THEN** the symbol match ranks above the prose match

### Requirement: Explicit agent escalation

For free-form questions the local index can't satisfy, Reado SHALL keep an
explicit "ask the agent" action whose result is cached and invalidated on content
change, and SHALL make an agent pass visibly distinct from instant local results.

#### Scenario: Escalate to the agent

- **WHEN** the user asks a natural-language question and chooses to ask the agent
- **THEN** the agent pass runs, its result is shown as an agent answer (distinct
  from local hits) and cached until the relevant content changes

#### Scenario: Cached agent answer reused

- **WHEN** the same question is asked again with no relevant content change
- **THEN** the cached agent answer is reused instead of re-running the agent
