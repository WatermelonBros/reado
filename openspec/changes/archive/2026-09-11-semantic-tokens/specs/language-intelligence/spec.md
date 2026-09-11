## ADDED Requirements

### Requirement: Semantic Highlighting

Reado SHALL request `textDocument/semanticTokens` for the open document when the
server offers it, and SHALL apply the result **over** the grammar's highlighting
rather than instead of it: a range the server describes takes the server's
meaning, and everything else keeps the grammar's.

The server's token types and modifiers SHALL be mapped onto the theme's
**existing** colours — Reado's palette is deliberately small, and an installed
theme defines those and no others — with non-colour cues carrying the
distinctions colour should not. A server that offers no semantic tokens SHALL
cost nothing and change nothing.

#### Scenario: The server's meaning wins where it speaks

- **WHEN** the server reports a range as a type and the grammar coloured it as a
  plain identifier
- **THEN** the range is drawn with the theme's definition colour

#### Scenario: A distinction colour should not carry

- **WHEN** the server reports a range as a parameter
- **THEN** it is drawn italic rather than given a seventh colour, so the
  distinction survives grayscale and any installed theme

#### Scenario: The grammar still covers the rest

- **WHEN** the server reports tokens for only part of the file
- **THEN** the rest keeps the grammar's colours

#### Scenario: A server with nothing to offer

- **WHEN** the server does not advertise semantic tokens
- **THEN** no request is made and the file looks exactly as it did

#### Scenario: Deprecated reads as deprecated

- **WHEN** the server marks a symbol deprecated
- **THEN** it is drawn struck through, which survives any theme

### Requirement: Keeping Up With Edits

Colouring SHALL follow the document as it is edited. Reado SHALL ask for a delta
rather than the whole file when the server offers deltas, and SHALL fall back to
a full request when it does not or when the delta cannot be applied.

Tokens computed against text that has since changed SHALL NOT be drawn against
the new text.

#### Scenario: Typing recolours

- **WHEN** the user renames an identifier and the server answers
- **THEN** the new text is coloured from the new answer

#### Scenario: A stale answer is dropped

- **WHEN** an answer arrives for text the user has already changed
- **THEN** it is discarded rather than applied at the wrong offsets

### Requirement: Turning It Off

A setting SHALL turn semantic highlighting off. With it off, no request SHALL be
made and the grammar's colouring SHALL stand alone.

#### Scenario: Off means silent

- **WHEN** the setting is off
- **THEN** no `textDocument/semanticTokens` request is made and the file shows
  the grammar's colours
