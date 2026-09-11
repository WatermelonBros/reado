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

### Requirement: Code Lenses

Reado SHALL show the code lenses the language server reports for the open
document (`textDocument/codeLens`), each on its own line directly above the line
it describes, and SHALL resolve a lens that arrives without a title
(`codeLens/resolve`) before showing it. Lenses SHALL be re-fetched when the
document changes, and SHALL disappear rather than point at stale offsets while
the answer is out of date.

A setting SHALL turn lenses off, and a server that advertises no
`codeLensProvider` SHALL simply show none — never an error, never a gap where
Reado's own behaviour used to be.

#### Scenario: A function's references are visible without asking

- **WHEN** a document is open in a language whose server reports code lenses
- **THEN** each lens the server reports appears above its line, showing the text
  the server gave it (e.g. "3 references")

#### Scenario: Lenses do not survive the edit that invalidates them

- **WHEN** the user edits the document
- **THEN** the lenses computed against the old text are dropped, and a fresh set
  is requested for the new text

#### Scenario: Turned off

- **WHEN** the code-lens setting is off
- **THEN** no lens is drawn and no `textDocument/codeLens` request is made

#### Scenario: A server with nothing to offer

- **WHEN** the server does not advertise `codeLensProvider`
- **THEN** no lens is shown and nothing is reported as failed

#### Scenario: Reado asks to be offered them

- **WHEN** Reado connects to a language server
- **THEN** it declares `textDocument.codeLens` among its client capabilities, and
  sends its lens settings with `workspace/didChangeConfiguration` — a server that
  builds its providers only for a client that asks, and then keeps them switched
  off until it is told otherwise, would advertise `codeLensProvider` and answer
  every request with an empty list, which is indistinguishable from a file that
  has no lenses

#### Scenario: The setting reaches a server already running

- **WHEN** the user turns code lenses on or off while a server is connected
- **THEN** Reado tells that server, so its answers match what Reado will draw

#### Scenario: The server says its answer changed

- **WHEN** a server sends `workspace/codeLens/refresh`
- **THEN** Reado answers it and asks again for the open documents, so an empty
  answer given while the server was still starting does not stand

### Requirement: Acting On A Lens

A lens SHALL be clickable, and the click SHALL do what the lens says.

When the lens's command carries locations (as `editor.action.showReferences`
does), Reado SHALL open the location itself if there is exactly one, and
otherwise offer the locations as a list of `file:line` to choose from. When the
command is one the **server** executes, Reado SHALL send it back with
`workspace/executeCommand`. A command Reado can neither open nor delegate SHALL
say so rather than doing nothing.

#### Scenario: One location

- **WHEN** the user clicks a lens whose command carries a single location
- **THEN** that file opens at that line

#### Scenario: Several locations

- **WHEN** the user clicks a lens whose command carries several locations
- **THEN** a list of `file:line` appears at the click, and choosing one opens it

#### Scenario: The server's own command

- **WHEN** the user clicks a lens whose command the server advertises in
  `executeCommandProvider`
- **THEN** Reado sends `workspace/executeCommand` with that command and arguments

#### Scenario: A command nobody can run

- **WHEN** the lens's command is neither a location list nor one the server
  advertises
- **THEN** Reado says the command is not supported instead of ignoring the click

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
