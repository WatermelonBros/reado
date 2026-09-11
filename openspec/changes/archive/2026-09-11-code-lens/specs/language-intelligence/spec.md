## ADDED Requirements

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
