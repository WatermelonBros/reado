## ADDED Requirements

### Requirement: Occurrence Highlight
The editor SHALL subtly highlight every occurrence of the identifier under the
cursor within the current file, using a muted theme colour.

#### Scenario: Highlight on cursor rest
- **WHEN** the cursor is on or beside an identifier
- **THEN** all other occurrences of that identifier in the file are highlighted

#### Scenario: Clear when irrelevant
- **WHEN** the cursor moves off any identifier
- **THEN** no occurrence highlight is shown

### Requirement: Syntax-Aware Selection
The editor SHALL let the user expand and shrink the selection by syntax node.

#### Scenario: Expand selection
- **WHEN** the user invokes "expand selection"
- **THEN** the selection grows to the enclosing syntax node (and shrinks back on
  the inverse command)

### Requirement: Nesting Cues
The editor SHALL show indentation guides and colourize matching bracket pairs,
using quiet theme colours.

#### Scenario: Guides and bracket pairs
- **WHEN** a file with nested blocks is open
- **THEN** indentation guides are visible and matching brackets share a colour

### Requirement: Outline Follows Cursor
The Outline panel SHALL highlight the symbol that contains the cursor.

#### Scenario: Cursor inside a function
- **WHEN** the cursor is inside a function listed in the Outline
- **THEN** that Outline entry is highlighted as the current symbol
