> Design note: the loop is implemented WITHOUT adding new persisted states to the
> shared `reado-core` comment model (which the CLI also depends on). Instead
> "resolved / pending review" is *derived*: an open comment on a file the agent
> changed since you last read it. This keeps the core/CLI contract stable while
> delivering the full review loop. Closing uses the existing `done` state.

## 1. Status lifecycle

- [x] 1.1 Existing states (`open` / `in-progress` / `done` / `discarded`) are kept;
      "pending review" is derived from (open comment + its file in the read-delta
      `changed` set), so no schema/CLI change is needed.

## 2. Anchored resolution diff

- [x] 2.1 A pending comment's "Review change" opens the file at the anchor and shows
      the delta the agent produced (reuses the read-delta `LAST_READ_BASE` diff),
      so the change is reviewed anchored to the comment.

## 3. Pending-review surfacing

- [x] 3.1 The Comments panel highlights pending comments (tinted row + "REVIEW"
      label) with "Review change" and "Resolve" actions.

## 4. Human verification / no silent close

- [x] 4.1 Nothing auto-closes: the human explicitly Resolves (→ `done`) after
      reviewing; otherwise the comment stays open. Rejecting = simply leaving it
      open (and the file's delta can be cleared via read-delta's "mark reviewed").

## 5. Verify

- [x] 5.1 EN + IT (`comments.pending/agentChanged/reviewChange/resolve`); typecheck
      + cargo check + build green.
