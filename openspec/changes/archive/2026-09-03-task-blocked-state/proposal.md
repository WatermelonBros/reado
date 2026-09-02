## Why

When an agent can't resolve a task, `reado task fail` just appends the reason as a
reply and reopens the task (`crates/reado-cli/src/main.rs`), so it re-enters the
same batch on the next Send review — with no escalation, no retry budget, and no
way to say "I need more context from the human." A genuinely un-resolvable task
loops or sits forever, indistinguishable from an untouched one. The richer
`needs-context` idea exists only inside guided review, not the plain task loop.
And when an agent quits mid-batch, there is no notion of which tasks were in-flight
to re-dispatch — the resolve loop just goes idle.

## What Changes

- **task-blocked-state** (capability):
  - A first-class **blocked / needs-input** task state (distinct from open, in
    progress, and done), set via `reado task block <id> "<what's needed>"`, so a
    task the agent can't finish is visibly waiting on the human rather than silently
    reopened.
  - The desktop surfaces blocked tasks distinctly (badge, filter) and lets the
    human answer, which returns the task to open with the added context.
  - A small **retry budget**: a task that fails repeatedly is auto-marked blocked
    after N attempts instead of looping.
  - **Re-dispatch of stragglers**: the resolve loop tracks which queued tasks are
    still unresolved and can re-issue just those when the agent restarts.

Out of scope: dependency ordering between tasks; parallel agents.

## Capabilities

### Added Capabilities

- **task-blocked-state** — a first-class blocked/needs-input state for tasks with a
  retry budget and straggler re-dispatch, so a task the agent can't resolve visibly
  waits on the human instead of looping, and a mid-batch agent restart re-issues
  only the unresolved tasks.
