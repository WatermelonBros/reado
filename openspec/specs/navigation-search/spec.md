# navigation-search Specification

## Purpose
TBD - created by archiving change add-reado-mvp. Update Purpose after archive.
## Requirements
### Requirement: Fuzzy File Open
Reado SHALL provide a fuzzy file finder (Cmd+P) to open files by name quickly.

#### Scenario: Open by fuzzy name
- **WHEN** the user invokes the file finder and types a partial file name
- **THEN** matching files are ranked fuzzily and the selected one opens

### Requirement: Full-Text Search
Reado SHALL provide full-text search across the project using ripgrep, respecting `.gitignore`.

#### Scenario: Search a string
- **WHEN** the user searches for a string
- **THEN** matching lines across the project are listed with file and line
- **AND** selecting a result navigates to that location

### Requirement: Command Palette
Reado SHALL provide a command palette (Cmd+K) exposing key actions such as open file, jump to comment, send review, and launch agent.

#### Scenario: Run an action from the palette
- **WHEN** the user opens the command palette and selects an action
- **THEN** that action is executed

### Requirement: Keyboard Shortcuts
Reado SHALL bind key actions (create comment, navigate comments, send review, launch agent, toggle panels) to keyboard shortcuts.

#### Scenario: Create a comment by shortcut
- **WHEN** the user selects lines and presses the create-comment shortcut
- **THEN** the inline comment editor opens for the selection

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

### Requirement: Find And Replace Within The Selection

The editor's find panel SHALL offer a "find in selection" mode that confines
finding, the match count, and replacing to the range that was selected when the
mode was turned on. The range SHALL be visible while the mode is active, SHALL
survive the selection changing, and SHALL track edits made inside it.

#### Scenario: Replace only inside the selection

- **WHEN** the user selects a function, turns on find in selection, and runs
  Replace All
- **THEN** only the occurrences inside that function are replaced

#### Scenario: Find stays inside the range

- **WHEN** find in selection is on and the user repeatedly runs Find Next
- **THEN** matching stops at the range's end and wraps to its start, never
  leaving it

#### Scenario: The count describes the range

- **WHEN** find in selection is on
- **THEN** the panel's `n of m` counts only the matches inside the range

#### Scenario: Selecting a match does not lose the scope

- **WHEN** Find Next selects a match inside the range
- **THEN** the range is unchanged and the following Find Next still honours it

#### Scenario: A multi-line selection means a scope

- **WHEN** the find panel is opened while more than one line is selected
- **THEN** find in selection turns on with that selection as the range, and the
  search field is not overwritten with the selected text

#### Scenario: Off by default

- **WHEN** find in selection is off
- **THEN** finding and replacing behave exactly as they do today, over the whole
  document

