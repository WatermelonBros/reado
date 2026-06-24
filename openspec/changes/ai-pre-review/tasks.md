## 1. Draft comment state

- [ ] 1.1 Add `"draft"` to `CommentState` in `src/lib/api.ts`; treat drafts as anchored comments excluded from open/task counts and from the AI review batch (`SendReviewDialog`, status-bar/badge counts in `ProjectView.tsx` / `TerminalPanel.tsx`).
- [ ] 1.2 Add `draft` to the ordered states + presentation metadata in `src/components/atoms/commentMeta.tsx` (distinct "proposed by AI" badge/colour, author = AI identity).

## 2. Trigger + prompt

- [ ] 2.1 `composeAiPreReviewPrompt(base, changedFiles, diff)` in `lib/review.ts`: cites file:line ranges, instructs the agent to record proposals as DRAFT `note`/`bug`/etc. comments via the `reado` CLI, and explicitly forbids editing code or posting open comments.
- [ ] 2.2 AI pre-review action: resolve the base (current branch vs working tree) from the diff-view base picker / git panel, compose the diff, inject the prompt into the focused agent pane via `submitToTerminal` (`src/lib/agents.ts`).
- [ ] 2.3 Add a command, command-palette entry, and a base-picker / git-panel affordance to trigger AI pre-review.

## 3. Curate drafts

- [ ] 3.1 Render drafts in the diff view + gutter (`Editor.tsx`, `commentGutter.ts`) and comments panel (`CommentsPanel.tsx`, `CommentThread.tsx`) with a clear draft treatment distinct from open comments.
- [ ] 3.2 Per-draft **Approve** (draft → open) and **Discard** (remove) actions wired through the comment store / `reado` API.
- [ ] 3.3 Surface a pending-drafts count / review affordance (status bar or comments-panel header).
- [ ] 3.4 i18n (EN + IT) for the trigger, draft state label, and approve/discard actions.

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green; an AI pre-review run produces DRAFT comments that can each be approved into an open comment or discarded, with no code edits and no auto-posted open comments.
