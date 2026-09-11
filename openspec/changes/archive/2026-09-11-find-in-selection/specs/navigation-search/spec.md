## ADDED Requirements

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
