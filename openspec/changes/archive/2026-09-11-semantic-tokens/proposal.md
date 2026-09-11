## Why

Reado colours code with a grammar, which guesses from the shape of the text. A
grammar cannot tell a parameter from a local, a type from a value, an async
function from a plain one, or a deprecated symbol from a live one — it only sees
that something looks like an identifier.

The language server *knows*. `textDocument/semanticTokens` is how it says so, and
it is the difference between a file that looks well coloured and one that is. For
an editor whose whole claim is reading, that difference is the product.

## What Changes

- Semantic tokens from the server, layered **over** the grammar rather than
  replacing it: the grammar keeps colouring everything, and the server's answer
  refines what it knows about. A server that says nothing costs nothing.
- Token types and modifiers mapped onto Reado's existing theme tokens, so every
  theme gets this without being rewritten — including `deprecated`, which is
  drawn struck through rather than given a colour.
- Deltas when the server offers them, so a keystroke does not re-fetch the file.
- One setting to turn it off, which also stops the requests.

## Capabilities

### Modified Capabilities

- `language-intelligence`: colouring from the server, over the grammar's.
