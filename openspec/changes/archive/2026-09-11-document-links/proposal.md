## Why

A path written inside a file is a path you have to copy and find yourself. Reado
already makes *some* of them clickable — it resolves imports and markdown links
with its own rules — but those rules stop where a language's do not: the
`"extends"` of a `tsconfig.json`, a `$ref` in an OpenAPI document, an `include` in
a build file, a `file://` URL in a config. The server knows all of them, and
answers with `textDocument/documentLink`.

## What Changes

- When a server offers document links, the ranges it reports are underlined on
  ⌘-hover and open on ⌘-click: a file target opens in the editor, a web target in
  the browser pane — the same two destinations Reado's own link handling already
  has.
- Reado's existing link resolution stays as the fallback, so nothing that is
  clickable today stops being clickable.
- Targets that arrive unresolved (`target` absent) are resolved through
  `documentLink/resolve` when the link is used, not when it is shown.

## Capabilities

### Added Capabilities

- `language-intelligence`: links the language server reports inside a document are
  clickable.
