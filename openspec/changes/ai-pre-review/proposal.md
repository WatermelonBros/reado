## Why

Reado's comment↔AI loop runs one direction today: the human writes durable
comments and the agent resolves them. But before a branch merges, the reverse is
just as valuable — a fast read-first pass that surfaces risky or notable changes
*as comments the human can keep*. The natural fit is to let the user point the AI
at a branch (or the working diff) and have it **propose** anchored comments,
exactly where the diff machinery already renders the change.

Crucially this stays inside Reado's principles: explicit triggers, never silent
action. The AI never edits code and never auto-posts. It only proposes DRAFT
annotations that appear as the user's own anchored comments in a distinct draft
state; the human approves each into a real open comment or discards it. This
reuses the existing comment + diff-view machinery wholesale — no new agent
plumbing, no new overlay — and keeps the human firmly the curator.

## What Changes

- Add a **DRAFT** comment state to the comment model (`src/lib/api.ts`
  `CommentState`, `src/components/atoms/commentMeta.tsx`): drafts are anchored
  comments authored on the user's behalf by the AI but not yet part of the open
  set, excluded from the AI review batch and from open/task counts.
- Add an **AI pre-review** explicit trigger over a chosen base (a branch or the
  working tree) — a command, palette entry, and an action on the diff-view base
  picker / git panel. It composes the selected diff and asks the focused agent
  (via `src/lib/agents.ts` / terminal injection and the `reado` CLI contract) to
  record proposals as DRAFT anchored comments on the changed lines.
- Render drafts in the diff view and comments panel (`src/components/organisms/Editor.tsx`,
  `commentGutter.ts`, `CommentsPanel.tsx`, `CommentThread.tsx`) with a clear
  "draft / proposed by AI" treatment distinct from open comments, plus per-draft
  **Approve** and **Discard** actions; Approve flips the draft to a normal open
  comment, Discard removes it.
- Surface a draft count / review affordance (e.g. status bar or comments-panel
  header) so the human knows pre-review proposals are waiting to be curated.
- i18n strings (EN + IT) for the trigger, the draft state, and the approve /
  discard actions.

## Capabilities

### Added Capabilities
- `ai-pre-review`: AI proposes DRAFT anchored comments on a branch/working diff that the human approves or discards.

## Out of Scope

- The AI editing code or applying fixes (that remains the resolve loop's job).
- Auto-posting or auto-approving proposals; every draft is curated by a human.
- New diff rendering or a new comment overlay — this reuses existing machinery.
- Posting comments to remote PR providers (GitHub/GitLab); drafts live in the
  local `.reado/` overlay like all other comments.
- Continuous/automatic review on every commit or branch change.
