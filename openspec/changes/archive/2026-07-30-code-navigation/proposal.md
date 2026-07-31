## Why

Navigation today is jump-only: Go to Definition opens the target file (losing
your place), and there's no way to jump to a symbol's *definition by name* across
the whole project — only within the current file (Go to Symbol). Reading flow
benefits from peeking a definition inline and from a fast workspace-wide symbol
jump.

## What Changes

- **Peek Definition**: show the definition of the symbol at the cursor in an
  inline panel over the current editor, without navigating away; Escape closes
  it, or click through to open the file.
- **Workspace Symbols (`⌘T`)**: a fuzzy picker over the project's symbol index
  that jumps straight to a symbol's definition (one entry per symbol), distinct
  from text search (which returns every textual occurrence).

Both reuse the existing symbol index that already powers Go to Definition.

## Capabilities

### Modified Capabilities
- `navigation-search`: adds Peek Definition (inline) and project-wide Workspace
  Symbol search.
