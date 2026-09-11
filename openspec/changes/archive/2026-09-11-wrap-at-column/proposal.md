## Why

Line wrap is a switch: off, or wrap at the window's edge. On a wide window that
second state barely helps — a 300-character line wraps at 300 characters, the
eye has to travel the whole monitor, and the ruler at column 120, which is the
width the project actually agreed on, is left as decoration.

Every editor with a ruler also offers to wrap *at* it. It is one number.

## What Changes

- A `wrapColumn` setting: `0` (the default) keeps today's behaviour — wrap at the
  viewport edge; any other value wraps at that column instead.
- The wrapped text is held to that measure regardless of window width, so the
  wrap point and the ruler line up.
- The setting sits next to the wrap toggle in Settings → Editor, and is disabled
  (visibly) while wrap itself is off, because that is the only state in which it
  does nothing.

## Capabilities

### Modified Capabilities

- `code-reading`: line wrap can wrap at a fixed column instead of the window edge.
