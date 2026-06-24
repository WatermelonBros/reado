## Why

Reado already has the two ends of the comment↔AI loop: durable, anchored
comments (`crates/reado-core`, `src/lib/comments.ts`) and a "Send Review" path
that dispatches open tasks to a terminal AI agent (`src/lib/review.ts`,
`src/lib/agents.ts`). What's missing is the **return path**. Today a task goes
`open → in-progress → done`, and `done` silently archives the comment — the user
never sees *what the agent changed* tied back to the comment they wrote. The
loop is open: the AI resolves, but the human never verifies.

This closes that loop, which is the core differentiator: **the comment is the
unit, the AI resolves, the human verifies.** We add a full status lifecycle to
each comment — `open → in-progress → resolved (pending review) → closed`, with
`reopened` — and, when the agent's edits touch the code a comment is anchored to,
Reado surfaces the change as a **diff anchored to that comment** in the Comments
panel. The user accepts (→ closed) or rejects (→ reopened). True to Reado's
principles: honest surfaces (never auto-close, the diff is always shown) and
explicit triggers (resolution and closure are deliberate, never silent).

## What Changes

- **Status lifecycle.** Extend `CommentState` in `crates/reado-core/src/lib.rs`
  (mirrored in `src/lib/api.ts`) with `resolved` (pending review), `closed`, and
  `reopened`, layered on the existing `open | in-progress | done | discarded`.
  Only `closed`/`done` archive (`.reado/comments/` → `.reado/archive/`);
  `resolved` stays active and visible. Add the legal transitions and persist
  them via `set_comment_state`. The agent marks a task `resolved` (not `done`)
  through the `reado` CLI contract; closure is the human's act.
- **Anchored resolution diff.** Persist, per resolved comment, the change the
  agent made to the anchored code: a captured before/after diff stored under the
  comment in `.reado` (e.g. a `resolution` block in the comment `.md` and/or a
  sibling file), produced from the git ref contents (`git_show_ref`) at the
  comment's anchor range. A new accept/reject pair (`accept_resolution` →
  `closed`, `reject_resolution` → `reopened`) lives beside `set_comment_state`.
- **Comments panel surfacing.** In `src/components/organisms/CommentsPanel.tsx`,
  surface `resolved` (pending-review) comments distinctly with a count, and add
  a "Pending review" filter/segment. Selecting one opens the thread with the
  anchored diff inline (reusing `DiffView.tsx` rendering scoped to the anchor)
  and Accept / Reopen actions.
- **Explicit triggers, no silent close.** Accept and Reopen are explicit user
  actions; nothing transitions a comment to `closed` automatically. New i18n
  copy (EN + IT) for the states, the pending-review surface, and the actions.

## Capabilities

### Added Capabilities
- `comment-resolution`: a status lifecycle and human-verified accept/reject loop
  for AI-resolved comments, with the change surfaced as a diff anchored to the
  comment.

## Out of Scope

- Auto-applying or auto-committing agent edits (the agent still edits via its own
  flow; Reado only captures and surfaces the result).
- Changing how reviews are dispatched ("Send Review" stays as is) or the agent
  launcher plumbing.
- Multi-comment batch accept/reject; resolution is per comment.
- A new git diff engine — the anchored diff reuses existing ref/diff plumbing.
