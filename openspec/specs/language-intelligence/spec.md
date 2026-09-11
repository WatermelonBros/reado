# language-intelligence Specification

## Purpose
TBD - created by archiving change language-server. Update Purpose after archive.
## Requirements
### Requirement: Managed Language Servers
Reado SHALL run language servers as external processes managed by the backend,
started per (language, project) when a matching file opens, and SHALL degrade
gracefully when no server is installed.

#### Scenario: Server starts on open
- **WHEN** a file whose language has a configured, installed server is opened
- **THEN** the corresponding language server is started for that project and
  receives the document

#### Scenario: Missing server
- **WHEN** no server is configured/installed for the language
- **THEN** Reado falls back to its index-based navigation and shows no errors

#### Scenario: Crash recovery
- **WHEN** a language server crashes
- **THEN** Reado reports it quietly and can restart it without reopening the file

### Requirement: Hover Information
When a server is available, the editor SHALL show type and documentation for the
symbol under the pointer on hover.

#### Scenario: Hover a symbol
- **WHEN** the pointer rests on a symbol and a server is available
- **THEN** a hover shows the server's type/documentation for it

### Requirement: Diagnostics
The editor SHALL display server diagnostics (errors/warnings) inline with quiet,
theme-coloured markers.

#### Scenario: Show diagnostics
- **WHEN** the server reports diagnostics for the open file
- **THEN** they appear inline at their ranges with severity styling

### Requirement: Precise Definition And References
When a server is available, Go to Definition and Find References SHALL use the
server's semantic results instead of the approximate index.

#### Scenario: Precise references
- **WHEN** the user finds references for a symbol and a server is available
- **THEN** only true semantic references are returned (not textual homonyms)

#### Scenario: Fallback when unavailable
- **WHEN** no server is available for the file
- **THEN** Go to Definition / Find References use the existing index

### Requirement: Document Symbols Feed Outline
When a server is available, the Outline (and Workspace Symbols) SHALL use the
server's document symbols.

#### Scenario: Server-backed outline
- **WHEN** a server provides document symbols for the open file
- **THEN** the Outline reflects them (kinds, nesting) instead of the heuristic

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

### Requirement: Server Folding Ranges

Where the language server offers `textDocument/foldingRange`, Reado SHALL use the
regions it reports for folding, and SHALL fall back to syntax-tree folding for
lines the server does not report.

#### Scenario: Folding an import block

- **WHEN** a file opens whose server reports the import block as a folding range
- **THEN** the block can be folded from the gutter as one region

#### Scenario: Syntax folding still works

- **WHEN** the cursor is on a line the server reports no region for
- **THEN** the syntax tree's own folding still applies

#### Scenario: No server

- **WHEN** no server is attached to the file
- **THEN** folding behaves exactly as it does today

### Requirement: Document Links

Where the language server offers `textDocument/documentLink`, Reado SHALL present
the ranges it reports as links in the editor and SHALL open their targets on
activation: a file target in the editor, a web target in the browser pane.

#### Scenario: A path in a config file

- **WHEN** the server reports the value of a path field as a document link
- **THEN** activating it opens that file in the editor

#### Scenario: Lazily resolved target

- **WHEN** the server reports a link with no target
- **THEN** the target is resolved when the link is activated, and then opened

#### Scenario: Unopenable target

- **WHEN** a link's target cannot be opened
- **THEN** Reado says so, naming the target

#### Scenario: No server support

- **WHEN** the server does not offer document links
- **THEN** Reado's own link resolution applies, as it does today

### Requirement: Linked Editing

Where the language server reports that the range under the cursor is linked to
others (`textDocument/linkedEditingRange`), Reado SHALL apply edits made inside
that range to its linked ranges in the same transaction, and SHALL mark the
linked ranges while the link is live.

#### Scenario: Renaming an HTML tag

- **WHEN** the user edits the name in an opening tag
- **THEN** the matching closing tag changes with it

#### Scenario: One undo

- **WHEN** the user undoes after a linked edit
- **THEN** both ranges return to their previous text in one step

#### Scenario: Editing outside the range

- **WHEN** an edit starts inside the linked range and extends beyond it
- **THEN** nothing is mirrored and the link is dropped

#### Scenario: No server support

- **WHEN** the server does not advertise linked editing ranges
- **THEN** no request is made and typing behaves as it does today

