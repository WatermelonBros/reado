## MODIFIED Requirements

### Requirement: Syntax Highlighting

Reado SHALL provide syntax highlighting via CodeMirror/Lezer language packs
across a broad range of languages. Where a file's language has no language
pack and an installed, enabled extension contributes a TextMate grammar for it,
Reado SHALL highlight the file from that grammar. A language pack SHALL always
take precedence over a contributed grammar, so the syntax tree that drives the
outline, focus block, syntax-aware selection and nesting cues is never traded
away for colour.

#### Scenario: Highlight a supported language
- **WHEN** the user opens a file in a language with a CodeMirror language pack
- **THEN** the code is highlighted according to the active theme

#### Scenario: Highlight from a contributed grammar
- **WHEN** the user opens a file whose language has no language pack but has a
  grammar contributed by an installed, enabled extension
- **THEN** the code is highlighted according to the active theme

#### Scenario: A language pack wins over a contributed grammar
- **WHEN** an extension contributes a grammar for a language Reado already has a
  language pack for
- **THEN** the language pack continues to provide highlighting and the syntax
  tree, and the grammar is not used

#### Scenario: Unknown language degrades gracefully
- **WHEN** the user opens a file whose language has neither a language pack nor
  a contributed grammar
- **THEN** the file is shown as plain readable text without error
