## Why

Rename the opening tag of `<section class="x">…</section>` and the closing tag
stays `section` — until you edit it too, or until the page renders wrong. Every
HTML-aware editor links the pair: type in one, the other follows.

The language servers already answer this (`textDocument/linkedEditingRange`
returns the ranges that must stay identical), and nothing in Reado asks.

## What Changes

- While the cursor sits inside a tag name — or any other range a server reports as
  linked — typing in it applies the same edit to its partner, in one undo step.
- The linked partner is marked faintly, so it is visible that the edit will be
  mirrored before a key is pressed.
- Purely server-driven: no server, no linked editing, and no HTML heuristic of our
  own to disagree with the server later.

## Capabilities

### Added Capabilities

- `language-intelligence`: ranges the server reports as linked are edited together.
