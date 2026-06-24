## Why

Reado is for reading code you didn't write, but a fresh repo is a flat wall of
files with no obvious entry point. Newcomers ask "where do I start?" and there is
no curated answer — only the file tree and search. A guided, ordered reading
path ("Start here") is the purest expression of the read-first thesis: a curator
(human or AI) leads you through the code in the order that makes it make sense.

This fits the comment↔AI loop cleanly. Tours reuse the same durable, anchored,
`.reado`-stored artifact model as comments: each step is an anchor plus a short
note. And like every other AI action in Reado, generating a tour is an explicit
trigger — the agent proposes a tour for a repo or feature only when asked, never
silently.

## What Changes

- **Tour data model**: an ordered sequence of steps, each with a code anchor
  (file path + optional line/region) and a short prose note, plus tour title and
  description. Persisted as JSON under the project's `.reado/tours/` directory,
  reusing the anchoring approach from comments (`src-tauri/src` storage + a
  `src/lib` API). Tours are shareable and may be committed (kept out of the
  gitignored cache paths so a project can opt in to versioning them).
- **Step-through navigation UI**: a new `tours` side-panel Tool (added to
  `WorkspaceState.Tool` in `src/lib/store.ts`) listing available tours; opening a
  tour enters a calm step-through reader with next/prev controls. The active
  step's note is shown quietly; advancing reveals the step's file and scrolls to
  its region in the editor.
- **AI-generated tour**: an explicit trigger (command palette / Command Center
  action and a button in the tours panel) dispatches a request to the terminal AI
  agent via `src/lib/agents.ts` to propose a tour for the repo or a named
  feature; the proposed tour is written as an editable tour artifact for review.
- **Manual create/edit**: create a tour, add/reorder/remove steps (anchoring a
  step to the current selection or file), and edit each step's note, with i18n
  EN+IT copy (`src/i18n/locales/en.json|it.json`).

## Capabilities

### Added Capabilities
- `reading-tour`: guided, ordered reading paths through a codebase — curated or
  AI-generated step sequences with anchored notes, stored in `.reado`.

## Out of Scope

- Cross-repository or multi-project tours (a tour belongs to one project).
- Branching, conditional, or non-linear tours; steps are a single ordered list.
- Auto-playing or timed tours; navigation is always user-driven.
- Rich media in notes (images, video); notes are plain text/markdown only.
- Automatic tour generation without an explicit user trigger.
