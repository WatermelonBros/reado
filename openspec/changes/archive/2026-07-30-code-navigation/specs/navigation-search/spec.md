## ADDED Requirements

### Requirement: Peek Definition
The editor SHALL show the definition of the symbol at the cursor in an inline
panel over the current editor, without navigating away.

#### Scenario: Peek a definition
- **WHEN** the user invokes Peek Definition on a symbol that resolves
- **THEN** an inline panel shows the definition's surrounding code in place

#### Scenario: Dismiss or open
- **WHEN** the peek panel is open
- **THEN** Escape closes it and an explicit action opens the definition's file

#### Scenario: Unresolved symbol
- **WHEN** the symbol has no known definition
- **THEN** the peek reports "no definition found" instead of opening an empty panel

### Requirement: Workspace Symbol Search
Reado SHALL provide a fuzzy symbol picker (e.g. `⌘T`) over the whole project that
jumps to a symbol's definition — one entry per symbol, distinct from full-text
search.

#### Scenario: Jump to a symbol by name
- **WHEN** the user opens Workspace Symbols and fuzzy-matches a name
- **THEN** selecting a result opens that symbol's definition at its line

#### Scenario: Distinct from text search
- **WHEN** a name also appears as plain text elsewhere
- **THEN** Workspace Symbols lists only its definition(s), not every occurrence
