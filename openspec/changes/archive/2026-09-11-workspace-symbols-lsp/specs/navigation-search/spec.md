## MODIFIED Requirements

### Requirement: Workspace Symbol Search

Reado SHALL provide a fuzzy symbol picker (e.g. `⌘T`) over the whole project that
jumps to a symbol's definition — one entry per symbol, distinct from full-text
search. The picker SHALL combine Reado's own symbol index with the results of
`workspace/symbol` from every attached language server, and SHALL show the index's
results without waiting for the servers.

#### Scenario: Jump to a symbol by name

- **WHEN** the user opens Workspace Symbols and fuzzy-matches a name
- **THEN** selecting a result opens that symbol's definition at its line

#### Scenario: Distinct from text search

- **WHEN** a name also appears as plain text elsewhere
- **THEN** Workspace Symbols lists only its definition(s), not every occurrence

#### Scenario: A symbol the index cannot see

- **WHEN** the symbol is generated, or lives in a dependency, and a language
  server reports it
- **THEN** it appears in the picker and opens where the server says it is

#### Scenario: The picker does not wait

- **WHEN** a language server is slow to answer
- **THEN** the index's results are shown immediately and the server's are merged
  in when they arrive

#### Scenario: No server

- **WHEN** no server is attached
- **THEN** the picker behaves exactly as it does today
