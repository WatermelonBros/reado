## ADDED Requirements

### Requirement: Open A GitHub PR As A Review Source

Reado SHALL let the user list and open a GitHub pull request through the `gh` CLI,
then **fetch and check out** the PR's branch so a guided review reads it with the
full read-first experience (LSP, navigation, real files). The read-first walk,
route, and curation are provided by `guided-pair-review`; this requirement only
makes the PR available to it.

#### Scenario: Open a PR

- **WHEN** the user opens a GitHub PR from the list
- **THEN** Reado fetches and checks out the PR branch and a guided review can be started over it

#### Scenario: Read-first parity on the PR

- **WHEN** a file from a checked-out PR is opened
- **THEN** language-server features and navigation work as for any opened project file

### Requirement: Provision The Required CLI

When the CLI a review source needs (`gh` for GitHub) is not installed, Reado SHALL
offer to install it and, on the user's confirmation, run the correct command for
the user's OS — reusing the extension-install machinery — then verify it works.
Reado SHALL NOT install anything without confirmation.

#### Scenario: Offer install when missing

- **WHEN** the user starts a GitHub review and `gh` is not installed
- **THEN** Reado offers to install `gh` and waits for confirmation

#### Scenario: Install and verify

- **WHEN** the user confirms the install
- **THEN** Reado runs the OS-appropriate install command and confirms `gh` is available before continuing

#### Scenario: Never silent

- **WHEN** `gh` is missing and the user has not confirmed an install
- **THEN** Reado installs nothing

### Requirement: Pull Existing PR Threads

When reviewing a GitHub PR, Reado SHALL pull the PR's existing review threads into
the guided review's comment inbox, each shown as a normal anchored comment with its
author and a "GitHub" origin badge that distinguishes it from local comments.

#### Scenario: Existing threads appear

- **WHEN** the user opens a PR that already has review comments
- **THEN** those threads appear as anchored comments with their author and a "GitHub" origin badge

#### Scenario: Unified inbox

- **WHEN** a PR has both pulled GitHub threads and the user's new local comments
- **THEN** both appear in the same comments inbox, distinguished only by the origin badge

### Requirement: Submit The Session As A Batched Review With A Verdict

Reado SHALL submit the guided review session's PR comments as a single GitHub
review with a verdict — **Approve**, **Request changes**, or **Comment**. Comments
SHALL NOT be posted individually before submission.

#### Scenario: Submit the review

- **WHEN** the user submits the session with a chosen verdict
- **THEN** all of the session's PR comments are posted as one GitHub review carrying that verdict

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
