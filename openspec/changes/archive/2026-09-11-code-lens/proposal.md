## Why

Reado is a read-first editor whose central claim is that what you need to know
about a line should be *visible*, not looked up. "How many places use this
function?" is the question a reader asks most, and today it costs a gesture and
a guess: `Find References` is a project-wide **text search** for the identifier
under the cursor (`docInfo.ts:831`). It finds the string in comments, in other
languages, in a variable that merely shares a name — and misses the call through
an alias.

The language server already knows the real answer. `textDocument/codeLens` is
how it offers it: a line above a symbol reading "3 references", "2
implementations", clickable. It is the one LSP feature that turns information
you must ask for into information you can see.

## What Changes

- Code lenses from the language server, drawn above the line they describe, with
  the document's own line as the anchor. Off with one setting, like every other
  editor ornament.
- Clicking a lens acts on it: one location opens it, several offer a menu of
  `file:line` to pick from, and a lens whose command is the server's to run is
  sent back to the server.
- Reado declares `textDocument.codeLens` and pushes its lens settings with
  `workspace/didChangeConfiguration`. Neither is bookkeeping:
  `typescript-language-server` builds its lens providers only for a client that
  asks, and then keeps them switched off until it is told otherwise — and it
  never asks. Missing either, it advertises `codeLensProvider` and answers every
  request with an empty list, which reads exactly like "this file has no
  lenses".

## Capabilities

### Added Capabilities

- `language-intelligence`: code lenses, and acting on one.
