## Why

The integrated terminal is tab-only: each tab is a single PTY, and only the
active tab is visible. Real reading/agent work often means watching more than one
terminal at once — an agent resolving tasks in one, a dev server or test watcher
in another — without losing either to a hidden tab. VS Code-style split panes
solve this: several terminals tiled in the same tab, resizable, in the
orientation the user wants.

## What Changes

- A terminal tab becomes a **group** that can hold multiple **panes** (each a
  PTY), tiled in a single axis (side-by-side or stacked).
- The user can **split** the active group (add a pane), **close** a pane, and
  **toggle the group's orientation** (horizontal/vertical).
- Panes are **drag-resizable** along the split axis; weights persist while the
  group is open.
- Exactly one pane is **focused** at a time — keystrokes, "Send review", "Audit"
  and agent launches target the focused pane. Clicking a pane focuses it.
- Tabs still exist (now one tab = one group); the existing dock position
  (bottom/right) and panel resize keep working, and panes re-fit on layout
  changes.
- The panel header stays **legible when narrow** (notably docked-right and
  shrunk): labeled buttons collapse to icon-only with tooltips below a width
  threshold instead of clipping or wrapping.
- No regression for the common case: a fresh tab is a group with a single
  full-size pane that behaves exactly as today.

Out of scope (this change): arbitrary nested/mixed-axis tiling trees, and
dragging panes between groups. Single-axis tiling per group is enough for the
read + agent workflow; nesting can be a later change if needed.

## Capabilities

### Modified Capabilities
- `integrated-terminal`: adds split panes within a tab (orientation toggle,
  resize, focused pane, close pane) on top of the existing multi-tab PTY model.
