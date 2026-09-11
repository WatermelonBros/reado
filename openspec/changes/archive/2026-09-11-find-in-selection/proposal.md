## Why

Replace All in the find panel is all-or-nothing: it rewrites the whole file. The
common editing job — "rename this local inside this function, and nowhere else" —
has no answer here short of doing it by hand, because the one control that would
give it (find *within the selection*) is missing.

CodeMirror's search extension has no scope of its own, but `SearchQuery.getCursor`
takes a range, which is the whole mechanism: with a range, find next, find
previous, the match counter and replace all are the same code over narrower
bounds.

## What Changes

- A fourth toggle in the find panel, beside `Aa` / `ab` / `.*`: find in selection.
- Turning it on freezes the selection that was current at that moment as the
  search range; the range is shown as a highlighted band so it is obvious what
  "in selection" currently means, and it survives moving the cursor (otherwise
  the first Find Next would destroy the scope by selecting a match).
- While it is on, Find Next / Find Previous / the `n of m` counter / Replace /
  Replace All all stay inside the range, wrapping at its ends rather than the
  document's.
- Edits inside the range move its end with them, so replacing a longer string
  doesn't push later matches out of scope.
- Opening the panel with a multi-line selection turns it on automatically — that
  selection is a scope, not a search term (a single-line selection keeps seeding
  the search field, as it does today).

## Capabilities

### Added Capabilities

- `navigation-search`: find and replace can be confined to the selected range of
  the open file.
