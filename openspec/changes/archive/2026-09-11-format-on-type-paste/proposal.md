## Why

Reado formats on save. That covers the file you are finishing, and nothing about
the file you are writing. The two moments VS Code also covers are the ones where
badly-shaped text appears *while* you work:

- **On paste** — code copied from a browser, a chat or another file arrives with
  the indentation it had there. Today it lands as-is and has to be re-indented by
  hand, which is the single most common small annoyance in an editor.
- **On type** — the closing `}` that should pull its line back out one level, the
  `;` that ends a statement. The server has a request for exactly this
  (`textDocument/onTypeFormatting`), which reports the characters it wants to be
  told about.

## What Changes

- `formatOnPaste` (default off): text pasted into the editor is re-indented to the
  block it lands in. Implemented from the language's own indentation service, not
  the formatter — a paste must not reformat the rest of the document, and must not
  wait on a server round trip.
- `formatOnType` (default off): typing one of the characters the server names as a
  trigger sends `textDocument/onTypeFormatting` and applies the edits it returns.
  With no server, or a server that doesn't offer it, the setting does nothing.
- Both sit in Settings → Editor beside Format on Save, and both are no-ops in a
  read-only buffer (a PR diff, a pinned file).

## Capabilities

### Modified Capabilities

- `document-formatting`: formatting also happens on paste and, where the server
  supports it, as characters are typed.
