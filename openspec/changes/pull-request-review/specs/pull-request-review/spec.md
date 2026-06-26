## ADDED Requirements

### Requirement: Detect The Forge Via A Provider Registry

Reado SHALL identify the hosting forge from the repository's `origin` remote URL
through an **extensible provider registry**: each adapter declares its host pattern,
the tool it drives, its install command, and its PR/MR operations and terminology.
GitHub (`gh`) and GitLab (`glab`) SHALL ship as the first adapters; the registry
SHALL be structured so further forges (Bitbucket, Gitea, Azure DevOps, self-hosted)
can be added without reworking the rest. When a host has an adapter, Reado SHALL use it.

#### Scenario: GitHub remote

- **WHEN** the project's `origin` points at `github.com`
- **THEN** Reado uses the GitHub adapter (`gh`) and the "pull request" terminology

#### Scenario: GitLab remote

- **WHEN** the project's `origin` points at `gitlab.com`
- **THEN** Reado uses the GitLab adapter (`glab`) and the "merge request" terminology

#### Scenario: A new adapter slots in

- **WHEN** an adapter for another forge (e.g. Gitea/`tea`) is registered with its host pattern
- **THEN** repos on that host use it without changes to the guided-review flow

### Requirement: Graceful Fallback Without An Adapter

Reado SHALL keep every repo reviewable: when the `origin` host has no adapter yet
(or can't be inferred — a self-hosted instance), the guided review SHALL still run
locally (branch scope + durable `.reado/` comments via `guided-pair-review`). Only
the host round-trip (pull threads / submit a review / sync resolution) SHALL be
unavailable, and Reado SHALL say so clearly rather than failing.

#### Scenario: Unknown host still reviewable

- **WHEN** the repo is hosted on a forge with no adapter (e.g. Bitbucket today)
- **THEN** the user can still run a full local guided review; Reado notes the host round-trip isn't available

#### Scenario: No remote at all

- **WHEN** the repo has no `origin` remote
- **THEN** guided review works locally and no forge round-trip is offered

### Requirement: Open A PR/MR As A Review Source

Reado SHALL let the user list and open a pull/merge request through the detected
forge's CLI (`gh pr` / `glab mr`), then **fetch and check out** its branch so a
guided review reads it with the full read-first experience (LSP, navigation, real
files). The read-first walk, route, and curation are provided by `guided-pair-review`.

#### Scenario: Open a request

- **WHEN** the user opens a PR/MR from the list
- **THEN** Reado fetches and checks out its branch and a guided review can be started over it

#### Scenario: Read-first parity

- **WHEN** a file from a checked-out PR/MR is opened
- **THEN** language-server features and navigation work as for any opened project file

### Requirement: Provision The Matching CLI

When the CLI the detected forge needs (`gh` or `glab`) is not installed, Reado SHALL
offer to install **that** CLI and, on the user's confirmation, run the correct
command for the user's OS — reusing the extension-install machinery — then verify it
works. Reado SHALL NOT install anything without confirmation.

#### Scenario: Offer the matching CLI

- **WHEN** the user starts a review on a GitLab remote and `glab` is not installed
- **THEN** Reado offers to install `glab` (not `gh`) and waits for confirmation

#### Scenario: Install and verify

- **WHEN** the user confirms the install
- **THEN** Reado runs the OS-appropriate command and confirms the CLI is available before continuing

#### Scenario: Never silent

- **WHEN** the CLI is missing and the user has not confirmed an install
- **THEN** Reado installs nothing

### Requirement: Pull Existing Threads

When reviewing a PR/MR, Reado SHALL pull its existing review threads into the guided
review's comment inbox, each shown as a normal anchored comment with its author and
a host origin badge (e.g. "GitHub" / "GitLab") that distinguishes it from local
comments.

#### Scenario: Existing threads appear

- **WHEN** the user opens a PR/MR that already has review comments
- **THEN** those threads appear as anchored comments with their author and a host origin badge

#### Scenario: Unified inbox

- **WHEN** a PR/MR has both pulled host threads and the user's new local comments
- **THEN** both appear in the same comments inbox, distinguished only by the origin badge

### Requirement: Submit The Session As A Batched Review With A Verdict

Reado SHALL submit the guided review session's comments as a single review on the
host with a verdict — Approve / Request changes / Comment on GitHub, and the
equivalent on GitLab. Comments SHALL NOT be posted individually before submission.

#### Scenario: Submit the review

- **WHEN** the user submits the session with a chosen verdict
- **THEN** all of the session's comments are posted as one review on the host carrying that verdict

#### Scenario: Pending until submitted

- **WHEN** the user has added comments but not yet submitted
- **THEN** nothing has been posted to the host yet

### Requirement: Bidirectional Resolution Sync

Resolving a review thread SHALL sync both ways: resolving (or reopening) a thread in
Reado SHALL resolve (or reopen) the corresponding conversation on the host, and the
resolved state pulled from the host SHALL be reflected in Reado.

#### Scenario: Resolve in Reado

- **WHEN** the user resolves a pulled host thread in Reado
- **THEN** the corresponding conversation on the host is marked resolved

#### Scenario: Reflect host resolution

- **WHEN** a conversation was resolved on the host and the PR/MR is refreshed in Reado
- **THEN** that thread shows as resolved in Reado
