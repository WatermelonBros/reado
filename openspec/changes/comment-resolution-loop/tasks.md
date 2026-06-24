## 1. Status lifecycle (core + persistence)

- [ ] 1.1 Extend `CommentState` in `crates/reado-core/src/lib.rs` with `Resolved`, `Closed`, `Reopened` (kebab-case serde, mirroring TS); document the lifecycle `open → in-progress → resolved → closed`, plus `reopened`.
- [ ] 1.2 Define legal transitions and archiving: only `closed` (and legacy `done`) archive `comments/` → `archive/`; `resolved`/`reopened` stay active. Reject illegal transitions.
- [ ] 1.3 Mirror the new states in `src/lib/api.ts` (`CommentState`) and any state lists (`COMMENT_STATES` in `commentMeta.tsx`).
- [ ] 1.4 Update the `reado` CLI contract so the agent marks a task `resolved` (pending review) rather than `done`; reflect this in `src/lib/review.ts` prompt copy.

## 2. Anchored resolution diff

- [ ] 2.1 Persist a per-comment resolution record in `.reado` (before/after of the anchored range + which ref/commit), captured via `git_show_ref` at the anchor; written by the core mutation, not the UI.
- [ ] 2.2 Add `accept_resolution` (→ `closed`, archive) and `reject_resolution` (→ `reopened`, clear/keep diff for re-review) in `crates/reado-core` + Tauri command wrappers in `annotations.rs` + `src/lib/api.ts`.

## 3. Comments panel surfacing

- [ ] 3.1 In `CommentsPanel.tsx`, count and surface `resolved` (pending-review) comments distinctly; add a "Pending review" filter/segment.
- [ ] 3.2 In the thread (`CommentThread.tsx`), render the anchored diff inline (reuse `DiffView.tsx` scoped to the anchor range) with Accept / Reopen actions.
- [ ] 3.3 i18n (EN + IT) for the new states, the pending-review surface, and the Accept/Reopen actions.

## 4. Explicit trigger / no silent close

- [ ] 4.1 Confirm no path auto-transitions to `closed`; Accept/Reopen are the only ways out of `resolved`, both user-initiated.
- [ ] 4.2 Always show the diff for a `resolved` comment before it can be closed (no blind accept).

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green; a resolved comment shows its anchored diff, Accept closes (archives), Reopen returns it to the active list.
