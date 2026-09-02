## ADDED Requirements

### Requirement: Blocked / needs-input state

Reado SHALL support a first-class blocked (needs-input) task state, distinct from
open, in-progress, and done, set via the CLI with a reason, so a task the agent
cannot finish visibly waits on the human rather than being silently reopened into
the same batch.

#### Scenario: Agent blocks a task

- **WHEN** the agent runs `reado task block <id> "<what's needed>"`
- **THEN** the task moves to blocked with the stated need, and is excluded from the
  next resolve batch until the human responds

#### Scenario: Human unblocks

- **WHEN** the human answers a blocked task's question
- **THEN** the task returns to open with the added context and is eligible for the
  next batch

#### Scenario: Blocked is visible

- **WHEN** tasks include blocked ones
- **THEN** the desktop surfaces them distinctly (badge/filter), not mixed in with
  untouched open tasks

### Requirement: Retry budget

Reado SHALL track failed attempts per task and auto-mark a task blocked after a
configured number of failures, instead of reopening it indefinitely.

#### Scenario: Repeated failures auto-block

- **WHEN** a task fails to resolve more than the budgeted number of times
- **THEN** it is auto-marked blocked rather than re-entering the batch again

### Requirement: Straggler re-dispatch

The resolve loop SHALL track which queued tasks are still unresolved and be able to
re-dispatch only those when the agent restarts, rather than going idle or
re-sending the whole batch.

#### Scenario: Agent restarts mid-batch

- **WHEN** the agent quits with some queued tasks unresolved and is relaunched
- **THEN** the resolve loop can re-issue just the unresolved tasks
