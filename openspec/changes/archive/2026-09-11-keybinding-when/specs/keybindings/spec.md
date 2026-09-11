## ADDED Requirements

### Requirement: Conditional Bindings

A keybinding MAY carry a `when` clause naming the context it applies in. The same
combo MAY be bound more than once with different clauses. On a keystroke Reado
SHALL run the first binding whose clause holds, in the order the user's bindings
are written, treating a binding with no clause as always applicable and therefore
the fallback.

A clause that names a context Reado does not know SHALL never match, and SHALL be
reported to the user rather than failing silently.

#### Scenario: One key, two meanings

- **WHEN** a combo is bound to one command `when terminalFocus` and to another
  with no clause, and the user presses it with the terminal focused
- **THEN** the terminal's command runs, and the unconditional one does not

#### Scenario: The fallback still applies

- **WHEN** that same combo is pressed with the editor focused
- **THEN** the unconditional binding runs

#### Scenario: A context that does not exist

- **WHEN** a binding names an unknown context
- **THEN** it never matches, and Reado reports the name as unknown

### Requirement: Context Vocabulary

Reado SHALL evaluate clauses against what is on screen at the moment of the
keystroke, and SHALL offer at least: `editorFocus`, `terminalFocus`,
`inputFocus`, `paletteOpen`, `dialogOpen`, `editorHasSelection`, `sidebarFocus`.
A clause MAY negate a context with `!` and MAY join contexts with `&&`, which
holds only when every part does.

#### Scenario: Negation

- **WHEN** a binding is written `when !inputFocus` and the caret is in a text
  field
- **THEN** it does not run, and the keystroke is left to the field

#### Scenario: Conjunction

- **WHEN** a binding is written `when editorFocus && editorHasSelection` and
  there is no selection
- **THEN** it does not run

### Requirement: Clauses Are Editable

The keybindings editor SHALL show a binding's clause and let the user change it,
so a conditional binding is as editable as an unconditional one.

#### Scenario: Editing a clause

- **WHEN** the user edits a binding's `when` clause in the keybindings editor
- **THEN** the change is saved with the binding and applies to the next keystroke
