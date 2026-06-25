## Why

Resolving comments is synchronous today: you dispatch the agent and babysit the
terminal until it's done. But a batch of comments is exactly the kind of work you'd
want to fire off and walk away from — queue it, let the agent (with its own
subagents) churn, and have Reado hold the *human* end of the loop: track progress
as comments get resolved, notice when the agent is blocked waiting for you, and
ping you when it's done.

Reado does **not** parallelize the agent — the agent already does that itself. Reado
owns the **loop**: queue → track → notify → review. And these are precisely the
events Reado Anywhere delivers to a paired phone, so you can fire a batch from your
desk and get pinged (and answer a blocked prompt) from the couch.

## What Changes

- Add a **review-loop queue**: by default all open task comments (each
  deselectable), dispatched to the agent as one "resolve these" run. The agent
  handles its own parallelism; Reado issues a single batch instruction.
- **Track progress by watching `.reado/` resolution** (reusing the
  comment-resolution loop): progress is how many queued comments are resolved, plus
  terminal activity. The loop's state SHALL persist so it survives a restart.
- Add a **blocked / "needs approval" state**: heuristically detect when the agent
  has stopped producing output and is waiting for input, and emit an event.
- Emit **loop events** — started, progress, needs-approval, finished, failed —
  surfaced in the desktop UI (a loop panel + a status indicator) and **over the
  Reado Anywhere channel** to paired phones. Reado Anywhere owns delivery; this
  capability owns the events.
- On **finish**, mark the queued comments resolved and notify; the user opens the
  delta to review the agent's changes themselves (no auto-open, no auto-approve).
- i18n strings (EN + IT) for the queue, the states, and the events.

## Capabilities

### Added Capabilities
- `async-review-loop`: queue open comments for the agent to resolve, track progress by watching `.reado/` resolution, detect when it's blocked, and emit finished/needs-approval events (delivered in-app and via Reado Anywhere).

## Out of Scope

- Reado orchestrating parallel agents or subagents itself — the agent does that.
- Auto-opening or auto-approving the agent's changes; finishing only marks resolved
  and notifies.
- Notification *delivery* mechanics (in-app channel, phone push): delivery is Reado
  Anywhere's job; this capability only produces the events.
- Multiple concurrent loops on one project — one active loop at a time.
