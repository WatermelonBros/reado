# Design — Phase 3: backend-dependent settings

## Context

Phases 1–2 never crossed the Rust boundary. Phase 3 does, so it must respect the
constraints Reado already enforces: a **path-confined filesystem** (reads/writes
resolve within the project root), a **command allow-list**, and **read-first
non-destructiveness** (opening a file never changes it). The settings here are
valuable precisely because they use backend knowledge (the real file tree, git),
so the risk is adding capability or egress by accident. This document records how
each stays inside the existing envelope.

## Goals / Non-Goals

**Goals**
- Add no new *unconfined* capability. Exclude globs, large-file checks, blame,
  and diff all run through the already-allow-listed, root-confined commands
  (`list_dir`, `search_text`, `read_file`, `git_*`, blame cache).
- Keep destructive-looking settings (save hygiene) strictly opt-in and applied
  only on an explicit write.
- Keep git features honestly gated: unavailable, and visibly so, outside a repo.

**Non-Goals**
- No telemetry / usage-data pipeline. Reado transmits nothing today; a telemetry
  *choice* would invent a system that doesn't exist. Phase 3 adds no network
  egress.
- No new editing power beyond the two save-hygiene toggles.

## Decisions

### Exclude globs — enforce in the backend, compose with gitignore
Exclusion is applied where the tree is walked and where search runs (`fs::list_dir`,
`search::search_text`), not filtered in the frontend, so excluded directories are
never read. Patterns are passed from the persisted setting into these calls. They
**compose with** the existing gitignore-aware walk (Reado already skips ignored
files) rather than replacing it: a path is shown only if it passes both.
- *Open decision for review*: interaction with "show hidden & ignored files".
  Proposed: the show-hidden override reveals gitignored/dotfiles but still honours
  the user's explicit `excludeGlobs` (excludes are intent, not inference). The
  spec's "show-hidden still overrides" scenario is written to this proposal;
  revisit if users want show-hidden to also bypass excludes.

### Large-file guard — decide in Rust at read time
`read_file` already returns a typed payload (text/binary/image). Extend the read
path (or a lightweight stat) so a text file over the threshold is returned with a
"large" flag, and the editor opens a plain, read-only, decoration-light view
(no LSP attach, no heavy highlighting, no diff/blame). "Open anyway" re-requests
the file bypassing the guard for that file+session. Threshold `0` disables it.
The check is on byte size, cheap, and avoids loading multi-hundred-MB buffers into
a full CodeMirror instance.

### Save hygiene — only on the confined write
Trim-trailing-whitespace and insert-final-newline are applied in the save flow
just before `write_file`, never on read. Both default off. This keeps "reading a
file leaves it byte-for-byte identical" true, which is core to Reado's promise.
Applied purely frontend (transform the buffer before the existing confined
`write_file`); no backend change needed for these two.

### Inline blame & diff gutter — reuse what exists
Blame already has a per-(file, HEAD) cache and a hover enrichment; inline blame is
a presentation of the same data as an end-of-line decoration for the current line.
Diff uses the existing `git_diff_lines`-style call against the base to drive gutter
markers, recomputed (debounced) as the buffer changes. Both are **repo-gated**:
the controls read as unavailable and draw nothing when `git.isRepo` is false or a
file is untracked. Uncommitted lines are labelled as such, never attributed to a
stale author.

### Persistence & portability
All Phase-3 settings live in the same `reado.settings` slice with documented
defaults and join the settings-sync allow-list — they are machine preferences,
not project state. No absolute paths or project-local data enter the bundle.

## Risks / Trade-offs

- **Exclude-glob performance**: matching on a hot `list_dir` path must be cheap;
  compile patterns once, match against relative paths. Mitigation: reuse the same
  matcher the gitignore walk uses if available.
- **Diff gutter churn**: recomputing diff on every keystroke is wasteful —
  debounce and diff against the cached base, not disk, while editing.
- **Large-file false negatives**: a "small" file that is pathological (one giant
  line) can still be slow; the byte threshold is a first guard, not a complete
  solution — note as a known ceiling, escalate to a line-length heuristic later
  if needed.
- **Show-hidden vs excludes** ambiguity (above) is the main behavioural decision
  reviewers should weigh before implementation.
