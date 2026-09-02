## ADDED Requirements

### Requirement: Shared agent-task runner

Reado SHALL provide a single runner for "dispatch a prompt to the agent, then
await a file-based result", exposing a typed result, a parse/validate step, and a
status distinct from an empty result: running, done, failed, cancelled, or
timed-out.

#### Scenario: Distinguishable states

- **WHEN** an agent task is dispatched
- **THEN** the UI can tell running from done from failed from timed-out, rather
  than only "empty vs non-empty"

#### Scenario: Malformed result is a failure, not empty

- **WHEN** the agent writes a malformed or unparseable result file
- **THEN** the task reports failed (surfaced via the notice surface), not an empty
  success

### Requirement: Cancellation and retry

The runner SHALL support user-triggered cancellation of an in-flight task and
retry with backoff, and SHALL expose an in-flight registry so the UI can show and
cancel running tasks.

#### Scenario: Cancel a running task

- **WHEN** the user cancels an in-flight agent task
- **THEN** the task stops polling and reports cancelled, freeing the UI

#### Scenario: Transient failure retries

- **WHEN** a task fails transiently and retry is enabled
- **THEN** it retries with backoff before reporting failed

### Requirement: Migrated features preserve behaviour

Synopsis, Q&A, semantic search, pre-review, and AI tours SHALL be migrated onto
the runner without changing their on-disk formats or user-visible results, and
their bespoke poll loops removed.

#### Scenario: Feature still works after migration

- **WHEN** the user runs file synopsis (or Q&A, semantic search, pre-review, AI
  tour) after migration
- **THEN** it produces the same result as before, now with cancellation and honest
  status
