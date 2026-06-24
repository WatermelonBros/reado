## Why

When opening an unfamiliar file in a read-first IDE, the first question is "what
is this and why does it exist?". Reado already lets you ask the agent to explain
a *selection*, but there is no calm, file-level orientation: a short synopsis of
the file's purpose, its key symbols, and how it fits the wider codebase. This is
the read-first complement to the comment↔AI loop — it helps you decide what to
read closely before you start dropping comments.

Per the user's UI decision, the synopsis must NOT be rendered inline at the top
of the file (that would push the code — the hero — down and clutter the canvas).
Instead a small, unobtrusive button in the editor header/breadcrumb area opens a
calm modal containing the synopsis. Generation is an explicit request (never
silent), and the result is cached under the project's `.reado/` directory so
re-opening the file is instant, with explicit regenerate and honest staleness
when the file changes substantially.

## What Changes

- A small **Synopsis** button in the editor header / breadcrumb area
  (`src/components/molecules/Breadcrumb.tsx` or the editor header in
  `src/components/pages/ProjectView.tsx`) that opens a **synopsis modal**. No
  inline-at-top rendering.
- A new `SynopsisModal` organism (`src/components/organisms/SynopsisModal.tsx`)
  built on the existing `Modal` atom and styled with the calm semantic tokens
  (`bg-overlay`, `border-line`, `text-ink/muted`), showing the file's purpose
  and key symbols, with explicit **Generate** / **Regenerate** controls and an
  honest empty/loading/stale state.
- AI-generated synopsis content (purpose + key symbols + how the file fits),
  composed via a prompt helper in `src/lib/review.ts` and produced through the
  existing agent contract; reuses Outline/document-symbol data
  (`src/lib/lsp.ts`) to seed the "key symbols" without re-deriving them.
- A synopsis cache module (`src/lib/synopsis.ts`) that reads/writes cached
  synopses under the project's `.reado/synopsis/` directory keyed by file path,
  storing a content fingerprint (hash + size) so staleness can be detected;
  Rust-side read/write helpers alongside the existing `.reado` plumbing
  (`src-tauri/src/index.rs` / a small `synopsis.rs`) if filesystem access is
  needed beyond the existing config API.
- Staleness handling: when the file's current fingerprint diverges substantially
  from the cached one, the modal surfaces a "may be out of date" banner and
  offers Regenerate; the cache is regenerable and invalidated on demand.
- i18n strings (EN + IT) for the button label, modal title, states, and actions.

## Capabilities

### Added Capabilities
- `file-synopsis`: an explicitly-triggered, cached AI synopsis of the current
  file (purpose + key symbols), shown in a calm modal opened from a header
  button — never inline.

## Out of Scope

- Inline / always-on synopsis rendered at the top of the editor.
- Folder- or project-level synopses (this is per-file only).
- Automatic background regeneration or pre-warming of synopses.
- Changing the existing Audit / Send Review / Explain-selection flows.
