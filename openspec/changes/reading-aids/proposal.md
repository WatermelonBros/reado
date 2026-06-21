## Why

Reado is read-first, but the editor still lacks the quiet structural cues that
make reading unfamiliar code fast: seeing every place the symbol under the cursor
appears, jumping by syntax node, and reading nesting at a glance. These are
cheap CodeMirror capabilities, fully in keeping with the calm aesthetic (no
minimap, no noise).

## What Changes

- **Occurrence highlight**: the identifier under the cursor is subtly highlighted
  everywhere it appears in the file.
- **Syntax-aware selection**: expand/shrink the selection by syntax node
  (statement → block → function), for reading structure.
- **Indentation guides** and **bracket-pair colorization**: quiet visual cues for
  nesting and matching brackets.
- **Outline follows the cursor**: the Outline panel highlights the symbol the
  cursor is currently inside.

All are off-by-default-noise: muted colours from the theme tokens, no new chrome.

## Capabilities

### Modified Capabilities
- `code-reading`: adds occurrence highlight, syntax-aware selection, indentation
  guides, bracket-pair colorization, and cursor-following outline.
