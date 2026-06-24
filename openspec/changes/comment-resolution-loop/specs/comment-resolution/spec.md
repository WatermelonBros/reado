## ADDED Requirements

### Requirement: Comment Status Lifecycle
Each comment SHALL carry a status drawn from the lifecycle `open → in-progress →
resolved (pending review) → closed`, with `reopened` as the path back from a
rejected resolution. The status SHALL persist in the comment's `.reado` record
(the `.md` front-matter) so it survives restarts and is shared with the `reado`
CLI. Reado SHALL treat `resolved` and `reopened` as still-active (kept under
`.reado/comments/`), and only `closed` (alongside the legacy `done`) SHALL
archive the comment to `.reado/archive/`.

#### Scenario: Agent resolves a task
- **WHEN** the AI agent finishes a task and marks it via the `reado` CLI
- **THEN** the comment's status becomes `resolved` (pending review) and it stays
  in the active comment list, not archived

#### Scenario: Status persists across sessions
- **WHEN** a comment is `resolved` and the project is reopened
- **THEN** the comment is loaded with status `resolved` from its `.reado` record

#### Scenario: Illegal transition rejected
- **WHEN** a transition outside the defined lifecycle is requested (e.g. `open`
  jumping straight to `closed`)
- **THEN** Reado SHALL reject it and leave the stored status unchanged

### Requirement: Anchored Resolution Diff
When a comment becomes `resolved`, Reado SHALL capture the change the agent made
to the code the comment is anchored to and store it as a diff tied to that
comment in `.reado`. The diff SHALL be derived from the tracked file contents at
a git ref (via the existing ref/diff plumbing) scoped to the comment's anchor
range, so the surfaced change is the unit of review — not an unrelated whole-file
delta.

#### Scenario: Diff captured on resolution
- **WHEN** a comment transitions to `resolved`
- **THEN** a before/after diff of the anchored range is recorded with the comment
  in `.reado`

#### Scenario: Diff shown anchored to the comment
- **WHEN** the user opens a `resolved` comment's thread
- **THEN** the captured diff is rendered inline, scoped to the comment's anchor

### Requirement: Pending-Review Surfacing
The Comments panel SHALL surface `resolved` (pending-review) comments distinctly
from `open` and archived ones, including a count of how many await review and a
way to filter to just them. Selecting a pending-review comment SHALL open it with
its anchored diff and the verification actions.

#### Scenario: Pending-review count
- **WHEN** one or more comments are `resolved`
- **THEN** the Comments panel shows how many are pending review

#### Scenario: Filter to pending review
- **WHEN** the user selects the pending-review filter/segment
- **THEN** only `resolved` comments are listed

### Requirement: Human Verification (No Silent Close)
Reado SHALL require an explicit user action to leave the `resolved` state and
SHALL never auto-close a comment. Accepting a resolution SHALL transition the
comment to `closed` (archiving it); rejecting it SHALL transition the comment to
`reopened` so it returns to the active list for another pass. The diff SHALL
always be available before the comment can be accepted.

#### Scenario: Accept closes the comment
- **WHEN** the user accepts a `resolved` comment's diff
- **THEN** the comment transitions to `closed` and moves to the archive history

#### Scenario: Reject reopens the comment
- **WHEN** the user rejects a `resolved` comment's diff
- **THEN** the comment transitions to `reopened` and stays in the active list

#### Scenario: Never auto-closed
- **WHEN** the agent reports a task done and a diff is captured
- **THEN** the comment stops at `resolved` and waits for the user; no path closes
  it without an explicit accept
