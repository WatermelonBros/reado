## Why

When reading unfamiliar code, the question that unblocks understanding is rarely
"what does this do?" but "*why* is it shaped this way — who wrote it, when, and
for what?". Git holds that history, yet today the reader must leave the file,
open a diff or a terminal, and break their reading flow to find it. A calm,
inline blame answers the *why* in place, which is squarely read-first.

The restraint matters as much as the feature. GitLens-style blame is loud — it
crowds every line, competes with the code, and trains the eye to ignore it.
Reado's version is the opposite: a faint, last-author + relative-date annotation
that recedes until you look for it, off by default, with the commit context one
hover away. It must never obscure the code that is the hero of the page.

## What Changes

- Formalize the **calm inline blame** capability: a per-line "author · relative
  age" annotation rendered as a quiet CodeMirror gutter (`src/lib/blameGutter.ts`,
  wired in `src/components/organisms/Editor.tsx`), toggled from the breadcrumb
  (`src/components/molecules/Breadcrumb.tsx`) and **off by default**
  (`blame` flag in `src/lib/store.ts`). Faint tokens via existing
  `text-faint`/`--text-faint` styling (`src/styles/app.css`), never the loud
  GitLens treatment.
- Back blame with **`git blame --line-porcelain`** on the Rust side
  (`git_blame` in `src-tauri/src/git.rs`, exposed via `src/lib/api.ts`),
  computed **lazily per file** only while blame is on, and **cache the result
  per (file, HEAD)** so toggling and re-opening a file does not recompute.
  Invalidate the cache when the file or HEAD changes.
- Add a **commit-context hover**: instead of relying only on the bare native
  `title`, surface the commit subject, abbreviated hash, full author and date in
  a quiet hover/tooltip when the reader dwells on a blame annotation.
- Codify **restraint guarantees**: faint by default, no per-line color noise,
  uncommitted ("not yet committed") lines shown muted, the gutter never shifts or
  obscures the code column, and the annotation degrades silently (empty) when git
  is unavailable or the file is untracked.

## Capabilities

### Added Capabilities
- `inline-blame`: a calm, toggleable per-line git blame (author + relative date)
  with commit-context on hover, backed by lazy per-file `git blame` on the Rust side.

## Out of Scope

- A full file-history / commit-log browser or per-line "open this commit" diff
  navigation (belongs with the git diff view, not blame).
- Heatmap/recency coloring, author avatars, or any always-on per-line treatment
  (explicitly rejected as the loud style).
- Blame for the diff view or for non-text files.
