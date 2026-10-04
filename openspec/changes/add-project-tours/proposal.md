## Why

A project can ship a guided tour through its own code — open this file, look at
*this* expression, here is why it matters — for whoever arrives next: a new
teammate, an open-source contributor. Writing one takes Reado's paid tier (the
official build's Tour editor); **walking one must work for everyone** who opens the
repository in Reado, community build included, with no account. So the tour lives
in the repository, versioned with the code it describes, and the player lives in the
core.

This is separate from the core's personal reading tours (`.reado/tours.json`) and
from the first-run tour of Reado's own UI; both stay as they are.

## What Changes

- **Project tours are one file in the repository**: `tour.json` at the project
  root, committed like any file, holding all of the project's tours.
- **An open format, not Reado's.** Nothing in the file names Reado. The format is
  published as a specification and a JSON Schema under a permissive licence, so
  other editors, IDEs and doc sites can read and write the same `tour.json`; tools
  add their own data under namespaced keys without breaking anyone.
- **A step points at a file, a span of lines, or an exact span within a line**
  (line + columns), with a title and a markdown body.
- **Playing a tour uses Ark UI's `Tour`**: each step opens its file, scrolls to it,
  spotlights the exact span on a dimmed backdrop, and shows the title and body in a
  dialog beside it, with back/next, progress and keyboard arrows.
- **The project tour**: the tour marked `onboarding` is the project's. A **"Project
  tour"** button (end of the editor tab bar, and the command palette) starts it and
  resumes where you left off; opening a project with nothing read offers it once.
  Other tours are listed in the palette ("Tour: Play…").
- **Steps survive edits**: each step quotes its code and re-anchors like a comment;
  a step whose code is gone says so.
- **Walking marks files read.**
- **Extension points** for the official build's Tour editor: a panel registry and an
  editor context-menu registry.

Out of scope here: authoring (official build, `reado-pro` change
`add-onboarding-tours`); a hand-written file plays all the same.

## Capabilities

### New Capabilities

- `project-tours`: the file format, the player, the project tour.

## Impact

- New `src/lib/projectTours.ts` (load, validate, watch `tour.json`),
  `ProjectTourPlayer.tsx` (Ark `Tour`, reusing the scrim of `OnboardingTour.tsx`),
  a tab-bar button, palette commands.
- `src/lib/panels.ts` / `layout.ts`: registered panels; `contextMenuItems.ts`:
  registered items.
- Docs: the specification in `docs/tour-format.md`; the JSON Schema published at a
  stable URL on the website (`/schema/tour/v1.json`) and kept in the repo; both
  CC0.
