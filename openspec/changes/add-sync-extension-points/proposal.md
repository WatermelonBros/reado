## Why

The official build is adding shared comments for teams. Two things it needs to show
have no place in the interface today: the state of the sync (up to date, syncing,
offline, needs attention) and a per-comment action ("keep this note private"). The
existing slots take no context, so a contribution cannot know which comment it sits
on. As with the first extension points, the core stays unaware of what fills them.

## What Changes

- **Two new UI slots**: `statusbar.left` (the status bar's left group, before the
  file path) and `comment.actions` (the comment thread's header, beside its own
  actions).
- **Slots with context**: a slot can pass data to what fills it. `comment.actions`
  passes the comment's id and the project root; the existing slots pass nothing.
  Registration is typed per slot, so a contribution that expects context cannot be
  put in a slot that gives none.
- The dev-only slot preview covers the new slots.
- **The comment file format as a public API** in `reado-core`: parse a comment
  file into metadata and thread, and render them back — so the sync engine merges
  comments with the store's own format code instead of a copy.
- No behavior change in the community build: empty slots render nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `host-extension-points`: two more named slots, and slots that pass context.
- `annotation-store`: the comment file format exposed as a public API.

## Impact

- `src/lib/slots.ts`, `src/components/atoms/Slot.tsx` (typed context).
- `StatusBar.tsx`, `CommentThread.tsx` (placements), `slotPreview.tsx`.
- `crates/reado-core`: `parse_comment` / `render_comment` public (thin wrappers
  over the existing `from_markdown` / `to_markdown`).
- Tests for both placements, for context reaching the contribution, and a
  round-trip test for the format API.
