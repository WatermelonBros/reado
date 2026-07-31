## Why

Today diagnostics are scattered: the editor renders inline lint markers for the
*open* file, and the file tree shows a per-file error count badge — but there is
no single place to see everything the language servers think is broken across the
project. To triage "what's broken / what to understand", a reader has to open
files one by one. That works against Reado's read-first thesis: understanding a
codebase starts with knowing where the problems are.

A Problems panel aggregates the diagnostics Reado already receives (via the
`publishDiagnostics` tap in `src/lib/lsp.ts`) into one calm, project-wide list
grouped by file. It is read-first by nature — a navigation surface, not an
editing one — and it feeds the comment↔AI loop: a problem is exactly the kind of
thing a reader turns into an anchored task comment for the agent to resolve.

## What Changes

- Extend the diagnostics store (`src/lib/diagnostics.ts`) to keep the full set of
  diagnostics per file — message, severity, and range — not just the error count.
  The file tree's existing error-count badge keeps working off the same data.
- Widen the `publishDiagnostics` tap in `src/lib/lsp.ts` to forward every
  diagnostic (all severities) into the store, replacing whole-file entries on each
  publish so the list stays live as the user reads and edits.
- Add a new side-panel tool `problems` to `WorkspaceState.Tool` in
  `src/lib/store.ts`, with its activity-bar entry and panel routing alongside the
  other tools.
- Add `src/components/organisms/ProblemsPanel.tsx`: a project-wide list grouped by
  file, each group collapsible and showing per-file counts; each row shows
  severity icon, message, and line:col. Clicking a row jumps to the location via
  `useProject.open(path, line)`.
- Add severity filter toggles (errors / warnings / info) with live aggregate
  counts in the panel header; presentation uses the existing diagnostic tokens
  (`--diag-error`, `--diag-warn`, `--diag-info`).
- Add i18n strings (EN + IT) for the panel title, filters, counts, and the empty
  state in `src/i18n/locales/en.json` and `it.json`.

## Capabilities

### Added Capabilities
- `problems-panel`: a read-first side panel aggregating project-wide language-server diagnostics, grouped by file, navigable, with severity filters and live counts.

## Out of Scope

- Quick fixes / code actions on a problem (the panel is read-first; turning a
  problem into a task comment already exists via the editor diagnostic tooltip).
- Running compilers/linters Reado isn't already wired to; only diagnostics already
  published by the active language servers are aggregated.
- Diagnostics for files no language server covers (unsupported languages).
- Sorting/grouping modes beyond grouped-by-file and severity filtering.
