## ADDED Requirements

### Requirement: Review A Local Branch

Reado SHALL let the user review a local branch by choosing it and a base; Reado
SHALL compose the diff against that base and present the change for read-first
review. The branch SHALL be checked out so the working tree reflects it.

#### Scenario: Pick a branch and base

- **WHEN** the user starts a branch review choosing a branch and a base
- **THEN** Reado checks out the branch and presents the diff against the base for review

#### Scenario: Local branch comments stay local

- **WHEN** the user comments during a local-branch review with no PR attached
- **THEN** the comments are stored in the project's `.reado/` overlay and not pushed anywhere

### Requirement: Review A GitHub Pull Request

Reado SHALL let the user list and open a GitHub pull request through the `gh` CLI,
then **fetch and check out** the PR's branch so the full read-first experience —
LSP, navigation, and file reading — applies over the change.

#### Scenario: Open a PR

- **WHEN** the user opens a GitHub PR from the list
- **THEN** Reado fetches and checks out the PR branch and presents its diff for review

#### Scenario: Read-first parity on the PR

- **WHEN** the user opens a file from a checked-out PR
- **THEN** language-server features and navigation work as they do for any opened project file

### Requirement: Provision The Required CLI

When the CLI a review source needs (`gh` for GitHub) is not installed, Reado SHALL
offer to install it and, on the user's confirmation, run the correct command for
the user's OS — reusing the extension-install machinery — then verify it works.
Reado SHALL NOT install anything without confirmation.

#### Scenario: Offer install when missing

- **WHEN** the user starts a GitHub review and `gh` is not installed
- **THEN** Reado offers to install `gh` and waits for the user's confirmation

#### Scenario: Install and verify

- **WHEN** the user confirms the install
- **THEN** Reado runs the OS-appropriate install command and confirms `gh` is available before continuing

#### Scenario: Never silent

- **WHEN** `gh` is missing and the user has not confirmed an install
- **THEN** Reado installs nothing

### Requirement: Pull Existing PR Threads

When reviewing a GitHub PR, Reado SHALL pull the PR's existing review threads and
present each as a normal anchored comment in the comments panel, showing its author
and a "GitHub" origin badge that distinguishes it from local comments.

#### Scenario: Existing threads appear

- **WHEN** the user opens a PR that already has review comments
- **THEN** those threads appear as anchored comments with their author and a "GitHub" origin badge

#### Scenario: Unified inbox

- **WHEN** a PR has both pulled GitHub threads and the user's new local comments
- **THEN** both appear in the same comments panel, distinguished only by the origin badge

### Requirement: Submit A Batched Review With A Verdict

Reado SHALL accumulate the user's PR comments into a pending review and submit them
as a single GitHub review with a verdict — **Approve**, **Request changes**, or
**Comment**. Comments SHALL NOT be posted individually before submission.

#### Scenario: Submit the review

- **WHEN** the user submits the pending review with a chosen verdict
- **THEN** all pending comments are posted as one GitHub review carrying that verdict

#### Scenario: Pending until submitted

- **WHEN** the user has added PR comments but not yet submitted
- **THEN** nothing has been posted to GitHub yet

### Requirement: Bidirectional Resolution Sync

Resolving a review thread SHALL sync both ways: resolving (or reopening) a thread in
Reado SHALL resolve (or reopen) the corresponding conversation on GitHub, and the
resolved state pulled from GitHub SHALL be reflected in Reado.

#### Scenario: Resolve in Reado

- **WHEN** the user resolves a pulled GitHub thread in Reado
- **THEN** the corresponding GitHub conversation is marked resolved

#### Scenario: Reflect GitHub resolution

- **WHEN** a conversation was resolved on GitHub and the PR is refreshed in Reado
- **THEN** that thread shows as resolved in Reado
