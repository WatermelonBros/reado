## Why

Opening an unfamiliar repository is the hardest moment for a read-first reader:
there's no obvious entry point, the architecture is implicit, and the important
modules are buried among config and noise. Reado already explains a *selection*
(ai-explain) and synopsizes a *single file* (file-synopsis), but nothing answers
the repo-level question every newcomer asks first — "what is this and where do I
start?".

An AI-generated **"understand this repo in 5 minutes"** overview fits the comment
↔ AI loop and the read-first thesis precisely: it's read-first onboarding for
code you didn't write. It is generated only on explicit request (never silent),
cached in `.reado/` and regenerable, honest about staleness, and — crucially —
calm and navigable: every entry point and key module links straight to the file
so the overview is a launch pad into reading, not a wall of prose.

## What Changes

- Add an **Onboarding** side-panel tool (`Tool` in `src/lib/store.ts`) that shows
  the repo overview: a short summary, the architecture, entry points, and key
  modules/directories with one-line roles and how they connect.
- Add a **"Generate repo overview"** explicit action (Onboarding panel button +
  command palette / Command Center entry). Generation goes through the existing
  agent contract (`src/lib/agents.ts`) with a repo-onboarding prompt; nothing is
  generated automatically.
- New frontend module `src/lib/onboarding.ts`: compose the generation prompt,
  load/save/clear the cached overview, and resolve overview links to files/dirs.
- New Rust commands in `src-tauri/src` (e.g. `onboarding.rs`) to read/write/delete
  the cached overview at `.reado/onboarding.json` and to record the commit/HEAD it
  was generated against for staleness detection.
- Navigable overview: every entry point and module entry is a link that opens the
  referenced file (or reveals the directory in the file tree).
- Staleness surface: the panel shows when the overview was generated and against
  which commit, and flags it as **possibly stale** when HEAD has moved — honestly,
  without auto-regenerating. A **Regenerate** action re-runs generation.
- The overview is linkable into a reading-tour (each entry point / module is a
  navigable anchor a tour can reference).
- i18n copy (EN + IT) for the panel, actions, empty state, and staleness notice.

## Capabilities

### Added Capabilities
- `repo-onboarding`: an explicitly-generated, cached, regenerable repo-level
  overview (architecture, entry points, key modules) with navigable links to
  files and directories, honest about staleness.

## Out of Scope

- Single-file explanation/synopsis (covered by `ai-explain` / file-synopsis) —
  this capability is strictly repo-level.
- Automatic or background generation; generation is always explicit.
- Multi-repo / workspace-wide overviews; scope is the single open project.
- A bespoke reading-tour engine — this change only makes the overview *linkable*
  into a tour, it does not build the tour runner.
