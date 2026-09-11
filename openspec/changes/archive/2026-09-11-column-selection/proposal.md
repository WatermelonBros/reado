## Why

Reado can already select a rectangle — hold Alt and drag. What it cannot do is
select one *without the mouse*, or stay in that mode for more than one gesture.
Editing a block of aligned text (a table, a column of assignments, a pasted CSV)
means holding a modifier and dragging precisely across a hundred lines, and any
misdrag starts over.

VS Code answers this with a mode you turn on and a set of keys that extend the
rectangle: ⇧⌥⌘↑/↓/←/→. In it, every ordinary selection gesture — click, drag,
arrow — is rectangular.

## What Changes

- A persistent column selection mode, toggled from the command palette, the
  keyboard (⇧⌥⌘C) and the status bar, and remembered across sessions like the
  other editor modes.
- While it is on, dragging with no modifier selects a rectangle, and
  ⇧⌥⌘ + arrow grows or shrinks the rectangle by a line or a character from the
  keyboard — in either mode, so the keys are useful without turning it on.
- The status bar shows the mode while it is active: a mode you cannot see is a
  mode that confuses the next person to touch the keyboard.

## Capabilities

### Added Capabilities

- `code-reading`: a persistent column-selection mode and keyboard column cursors.
