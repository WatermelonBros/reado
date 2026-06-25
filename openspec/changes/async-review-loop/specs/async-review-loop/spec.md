## ADDED Requirements

### Requirement: Queue Open Comments For Resolution

Reado SHALL let the user start a review loop that queues the project's open task
comments — selected by default, each deselectable — and dispatches them to the
agent as a single resolve run. Reado SHALL issue one batch instruction and SHALL
NOT orchestrate parallelism itself.

#### Scenario: Queue defaults to all open tasks

- **WHEN** the user starts a review loop
- **THEN** all open task comments are queued by default, with the option to deselect any

#### Scenario: Dispatch as one run

- **WHEN** the queue is confirmed
- **THEN** the agent is dispatched once to resolve the queued comments, and the agent manages its own subagents/parallelism

### Requirement: Track Progress By Watching Resolution

Reado SHALL track loop progress by watching how many queued comments have been
resolved in `.reado/`, combined with terminal activity. The loop's state SHALL
persist so it survives an app restart.

#### Scenario: Progress reflects resolved comments

- **WHEN** the agent resolves some of the queued comments
- **THEN** the loop's progress updates to reflect how many of the queued comments are resolved

#### Scenario: State survives a restart

- **WHEN** the app is restarted while a loop is in progress
- **THEN** the loop's state is restored and progress tracking continues

### Requirement: Detect Blocked / Needs-Approval

Reado SHALL detect, heuristically, when the agent has stopped producing output and
is waiting for input, and SHALL emit a needs-approval event so the user can respond
(including from a paired phone via Reado Anywhere).

#### Scenario: Agent waits for input

- **WHEN** the agent stops producing output and appears to be waiting for input during a loop
- **THEN** Reado emits a needs-approval event for that loop

#### Scenario: Resumes after the user responds

- **WHEN** the user provides the awaited input and the agent resumes
- **THEN** the loop leaves the needs-approval state and progress tracking continues

### Requirement: Emit Loop Events

Reado SHALL emit loop lifecycle events — started, progress, needs-approval,
finished, and failed — and surface them in the desktop UI (a loop panel and a
status indicator). The events SHALL also be made available over the Reado Anywhere
channel for delivery to paired phones; this capability produces the events while
Reado Anywhere performs delivery.

#### Scenario: Events shown on the desktop

- **WHEN** a loop changes state (e.g. starts, progresses, finishes)
- **THEN** the desktop loop panel and status indicator reflect the new state

#### Scenario: Events available to Reado Anywhere

- **WHEN** a loop event occurs and a phone is connected via Reado Anywhere
- **THEN** the event is available on the Anywhere channel for delivery to the phone

### Requirement: Finish Marks Resolved And Notifies

When the loop finishes, Reado SHALL mark the queued comments resolved and emit a
finished event/notification. Reado SHALL NOT auto-open or auto-approve the agent's
changes; the user opens the delta to review them.

#### Scenario: Finish notifies

- **WHEN** the loop completes
- **THEN** the queued comments are marked resolved and a finished event is emitted

#### Scenario: No auto-open

- **WHEN** the loop completes
- **THEN** Reado does not automatically open or approve the diff; the user opens the delta to review
