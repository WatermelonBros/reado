## Why

Reado already tracks which files a reader has read (`.reado/read.json`, surfaced
as a `read/total` count in the file-tree header) and which read files have
changed since. But that state is only ever shown as one global number. For a tool
whose primary verb is *reading a codebase to understand it*, there is no answer to
the natural question: **"how far through this codebase am I, and where are the
gaps?"** — no per-area breakdown, no sense of which folders are unread, no list of
what changed and needs re-reading.

The data to answer this is already collected; it just isn't aggregated or shown.

## What Changes

- **reading-coverage** (capability): a side-panel tool that turns the read set
  into a reading map of the project:
  - An **overall** figure — files read / total, as a percentage, with a calm
    progress bar.
  - A **per-folder** breakdown (top-level directories) each with its own read/
    total and a mini bar, so the reader sees which areas are covered and which are
    untouched, biggest areas first.
  - A **"changed since read"** section listing read files that changed externally
    (e.g. the agent edited them) and so have a delta worth re-reading — click to
    open.
  - Live updates as files are read/unread or change, driven by the existing
    read-progress store; honest empty state before anything is read.
  - Motion: bars grow to their value with a short, calm transition (reduce-motion
    honoured).
- **i18n**: `en.json` + `it.json`.

Out of scope: line-level "how much of a file did you read" (the read flag is
whole-file); a persisted historical trend; gamified streaks. This is a present-
state map, not analytics.

## Capabilities

### Added Capabilities

- **reading-coverage** — a reading-map side panel that aggregates the existing
  read-progress state into an overall percentage, a per-folder breakdown, and a
  changed-since-read list, so a reader can see how far through a codebase they are
  and where the gaps are.
