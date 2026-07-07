## Why

Phases 1 and 2 were pure frontend: values in the settings store applied to the
editor and chrome. Phase 3 covers the settings that genuinely **need the Rust
backend** — filesystem knowledge and git — and so were deliberately deferred.

These are the settings that touch trust boundaries Reado has hardened (a
path-confined filesystem, a command allow-list, read-first non-destructive
behaviour). They must be designed carefully, which is why they are their own
change with a design document rather than bolted onto the frontend phases.

The value is real for a read-first review tool:

- A **quieter file tree**: let readers exclude `node_modules`, build output, and
  lockfiles so the tree and search show only what's worth reading.
- **Passive git review signals**: inline blame (who/when per line) and diff
  gutter markers (what changed vs the base) surface review context without
  opening a separate diff.
- **Safe handling of huge/minified files** so a reader isn't dropped into an
  unreadable or app-choking buffer.
- **Save hygiene** (trim trailing whitespace, final newline) for the light
  editing/annotation that does happen.
- **Session restore** made an explicit, honest choice rather than implicit.

## What Changes

- **settings-files** (filesystem-backed):
  - `excludeGlobs` (list of glob patterns) — hide matching paths from the file
    tree and project search. Applied in the Rust `list_dir` / `search_text`
    layer so excluded paths are never walked, honoured alongside existing
    gitignore handling.
  - `restoreSession` (boolean) — whether reopening a project restores its tabs,
    active file, and scroll/caret from the persisted session, or starts clean.
  - `largeFileGuard` (number, MB, `0` = off) — files above the threshold open in
    a plain, read-only, decoration-light mode instead of the full editor, with a
    one-click "open anyway".
  - `trimTrailingWhitespace` (boolean) and `insertFinalNewline` (boolean) —
    applied on save only, never silently on read; disabled by default to respect
    read-first non-destructiveness.
- **settings-git-signals** (git-backed, only in a repo):
  - `inlineBlame` (boolean) — show per-line authorship (author + date) as a quiet
    end-of-line annotation for the current line, backed by the existing blame
    cache.
  - `diffGutter` (boolean) — mark added/changed/removed lines in the gutter vs
    the git base, updating as the file changes.
- **Honest gating**: git controls have no effect (and read as unavailable)
  outside a git repo; file-exclude changes re-list the tree without a restart;
  save-hygiene runs only through the confined write path.
- **Backend work**: extend `list_dir`/`search_text` for exclude globs; a blame
  presence already exists (reuse); a `git_diff_lines`-style call already exists
  for diff — wire it to a gutter. No new unconfined capabilities.
- **i18n**: `en.json` + `it.json`.

Out of scope: a networked telemetry/usage-data pipeline — Reado transmits nothing
today, so a telemetry *choice* would be inventing a system that doesn't exist.
This change adds no network egress. Assumes Phases 1–2 have landed.

## Capabilities

### Added Capabilities

- **settings-files** — filesystem-backed preferences: exclude-from-tree/search
  globs, session restore, a large-file safety mode, and opt-in save hygiene,
  each honouring Reado's path confinement and non-destructive defaults.
- **settings-git-signals** — repo-only passive review signals: inline per-line
  blame and diff gutter markers vs the git base, gated to actual repositories.
