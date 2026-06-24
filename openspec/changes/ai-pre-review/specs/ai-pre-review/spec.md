## ADDED Requirements

### Requirement: Trigger AI Pre-Review

Reado SHALL let the user explicitly trigger an AI pre-review over a chosen base —
a branch or the working tree — which composes that base's diff and asks the
focused agent to propose comments on the changed lines. The pre-review SHALL run
only on this explicit user action, never automatically.

#### Scenario: Pre-review the working diff

- **WHEN** the user triggers AI pre-review with the base set to the working tree
- **THEN** the uncommitted diff is composed and sent to the focused agent with a
  prompt asking it to propose comments on the notable/risky changes

#### Scenario: Pre-review a branch

- **WHEN** the user triggers AI pre-review against a selected branch as the base
- **THEN** the diff against that branch is composed and sent to the focused agent

#### Scenario: No automatic run

- **WHEN** the user switches branches or a commit lands without invoking the trigger
- **THEN** no AI pre-review runs

### Requirement: Proposals As Draft Comments

The AI's proposals SHALL appear as anchored comments in a distinct `draft` state,
rendered with the existing comment and diff-view machinery and authored on the
user's behalf by the AI. A draft SHALL be excluded from open/task counts and from
the AI review batch until it is approved.

#### Scenario: Draft rendered in the diff

- **WHEN** the agent records a proposal during pre-review
- **THEN** it appears as an anchored comment in the `draft` state with a clear
  "proposed by AI" treatment distinct from open comments

#### Scenario: Drafts excluded from the review batch

- **WHEN** the user sends a review batch while drafts exist
- **THEN** drafts are not included; only approved open task comments are sent

### Requirement: Approve Or Discard Each Draft

The user SHALL be able to approve or discard each draft individually. Approving a
draft SHALL turn it into a normal open comment; discarding it SHALL remove it. No
draft becomes an open comment without the user's explicit approval.

#### Scenario: Approve a draft

- **WHEN** the user approves a draft
- **THEN** the comment transitions to the `open` state and behaves as a normal
  anchored comment (countable, batchable)

#### Scenario: Discard a draft

- **WHEN** the user discards a draft
- **THEN** the comment is removed and is not added to the open set

### Requirement: No Code Edits And No Auto-Post

During AI pre-review the agent SHALL only propose annotations; Reado SHALL ensure
the agent neither edits code nor posts open comments. The human curates every
proposal.

#### Scenario: Pre-review leaves code untouched

- **WHEN** an AI pre-review run completes
- **THEN** no source file has been modified by the agent

#### Scenario: Nothing posted without curation

- **WHEN** an AI pre-review run completes
- **THEN** every produced comment is in the `draft` state, with none auto-promoted
  to `open`
