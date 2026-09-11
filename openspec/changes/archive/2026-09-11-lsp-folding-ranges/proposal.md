## Why

Folding today comes from the syntax tree, which knows nodes and not meaning. It
folds a function body and a JSON object; it does not fold the block of imports at
the top of a file, a `#region` / `#pragma` section, a run of `//` comments, or
anything else a parser sees as a sequence of siblings rather than one node. Those
are exactly the regions you want collapsed when reading a long file.

`textDocument/foldingRange` is the server's answer and is cheap: one request per
document version.

## What Changes

- When a server offers folding ranges, the editor's fold service asks it first and
  falls back to the syntax tree for any line the server doesn't cover, so folding
  is never worse than it is now.
- Fold All / Unfold All and the fold gutter all use it, because it is the same
  service they already call.
- Comment and import blocks, `#region` markers and other server-declared regions
  become foldable.

## Capabilities

### Added Capabilities

- `language-intelligence`: folding regions declared by the language server.
