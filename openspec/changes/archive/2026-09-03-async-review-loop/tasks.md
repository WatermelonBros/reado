> Reado owns the **human loop**, not the parallelism: queue open comments → one
> agent dispatch → track by watching `.reado/` resolution → detect when blocked →
> emit started/progress/needs-approval/finished/failed. The agent (with its own
> subagents) does the work; Reado Anywhere delivers the events to the phone.

## 1. Queue & dispatch

- [x] 1.1 Start a review loop: queue open task comments (all by default, each deselectable).
- [x] 1.2 Dispatch once to the agent to resolve the queued comments (reuse
      `dispatchToAgent`); the agent manages its own subagents — Reado does not parallelize.

## 2. Progress tracking

- [x] 2.1 Watch `.reado/` resolution + terminal activity to derive progress
      (resolved / total queued), reusing the comment-resolution loop.
- [x] 2.2 Persist loop state (`.reado/`) so it survives an app restart and resumes tracking.

## 3. Blocked detection

- [x] 3.1 Heuristic: output stalled + terminal awaiting input → enter needs-approval state.
- [x] 3.2 Leave needs-approval and resume tracking once the agent proceeds.

## 4. Events & surface

- [x] 4.1 Emit lifecycle events: started, progress, needs-approval, finished, failed.
- [x] 4.2 Desktop surface: a loop panel + a status indicator reflecting the current state.
- [x] 4.3 Expose the events on the Reado Anywhere channel (delivery is Anywhere's job).

## 5. Finish

- [x] 5.1 On finish, mark queued comments resolved and emit the finished event.
- [x] 5.2 No auto-open / no auto-approve — the user opens the delta to review.

## 6. Glue

- [x] 6.1 i18n strings (EN + IT): queue, states, events.
- [x] 6.2 Tests: queue selection; progress derivation from resolved counts; state
      persistence/restore; needs-approval enter/leave; finish marks resolved.
