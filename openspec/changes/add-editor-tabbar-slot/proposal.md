## Why

The official build's pair sessions show who is in the session — a stack of avatars,
the invite menu, the pen — at the right end of the editor's tab bar, where it is
visible while reading and doesn't take a line of its own. The core has no place
there for an embedding build to fill.

## What Changes

- An **editor-extension registry**: an embedding build registers a function that,
  given the file an editor is opening (root, relative path, primary), returns
  CodeMirror extensions to add to it; and **write guards** that hold a file back
  from being written. The official build's co-editing uses both.
- A new named slot, `editor.tabbar`: the right end of the primary editor group's tab
  bar, outside the scrolling strip of tabs, so it stays put however many tabs are
  open. Empty in the community build, taking no space.

## Capabilities

### Modified Capabilities

- `host-extension-points`: one more named slot.

## Impact

`src/lib/slots.ts` (the slot's name and props), `Tabs.tsx` (renders it for the
primary group only, and keeps the bar for it when no tab is open),
`src/lib/editorExtensions.ts` and `CodeView.tsx` (the registry).
