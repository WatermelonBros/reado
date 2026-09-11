## ADDED Requirements

### Requirement: Rename Symbol

Reado SHALL rename a symbol across the project through the language server, and
SHALL determine the range to rename by asking the server
(`textDocument/prepareRename`) before prompting the user, falling back to the
editor's own word boundary only when the server does not offer that request or
does not answer it.

#### Scenario: Symbol that is not a word

- **WHEN** the cursor is on a symbol whose text is not a plain word — a decorator,
  a sigil-prefixed variable, a kebab-case CSS custom property
- **THEN** the prompt opens with the symbol the server names, and the rename
  rewrites exactly that range

#### Scenario: Symbol that cannot be renamed

- **WHEN** the server answers that the position cannot be renamed
- **THEN** Reado says so and never asks the user to type a new name

#### Scenario: Server without prepare support

- **WHEN** the server does not advertise `prepareProvider`
- **THEN** rename behaves as before, using the editor's word boundary

#### Scenario: Prepare request fails

- **WHEN** the prepare request throws or times out
- **THEN** the rename still proceeds from the editor's word boundary
