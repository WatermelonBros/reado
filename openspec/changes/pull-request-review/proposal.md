## Why

Guided Pair Review (`guided-pair-review`) brings any change into the read-first
reader — file by file, with durable comments the agent can resolve. This
capability is its **GitHub adapter**: it makes a GitHub pull request both a
*source* for a guided review and a *sink* for its results, so a review done in
Reado is a real PR review.

The bridge is two-way: pull the PR's existing threads into Reado so nothing is
lost, accumulate the session's comments into a pending review, submit it as one
GitHub review with a verdict, and keep resolution in sync both ways. Auth
piggybacks on the user's **`gh` CLI** — and if it isn't installed, Reado installs
it for them (the same machinery the extensions marketplace uses for language
servers), so there's no manual setup detour.

This capability does **not** re-implement the read-first walk, the route, the
comment curation, or the session — those are `guided-pair-review`. It only opens
a PR for it and round-trips the results to GitHub.

## What Changes

- Add **GitHub PR as a review source**: list and open a PR through the `gh` CLI,
  then **fetch and check out** its branch so a guided review reads it with the
  full experience (LSP, navigation, real files).
- Add **required-CLI provisioning**: when `gh` (or, later, `glab`) is missing,
  Reado offers to install it and runs the correct per-OS command — reusing the
  extension-install machinery (`src/lib/extensions.ts`) — then verifies it. Never
  silent; always user-confirmed.
- **Pull existing PR threads** into the guided review's comment inbox, each shown
  as a normal anchored comment with its author and a **"GitHub" origin badge**.
- **Submit the session's comments as a batched GitHub review** with a verdict
  (**Approve / Request changes / Comment**) — nothing posted until submission.
- **Bidirectional resolution sync**: resolving a thread in Reado resolves the
  GitHub conversation and vice-versa.
- i18n strings (EN + IT) for the source picker, verdict actions, sync state, and
  the CLI-install prompt.

## Capabilities

### Added Capabilities
- `pull-request-review`: the GitHub adapter for guided reviews — open a PR as a review source (fetch & check out), pull its threads in, submit the session as a batched review with a verdict, and sync resolution; installs `gh` if missing.

## Out of Scope

- The read-first review experience itself — scope/route/file-by-file/curation,
  sessions, summaries, the CLI session contract. That's `guided-pair-review`.
- Reviewing a **local branch** (no provider) — also a `guided-pair-review` scope;
  this capability is only the GitHub round-trip.
- GitLab (`glab`) review; the CLI-provisioning is built generic so `glab` slots
  in later, but GitLab PR review itself is a later capability.
- Other providers (Bitbucket, Gitea, etc.).
- Editing code on the PR inline (Reado stays read-first; edits go through the agent).
- Three-way merge of edited comment text — sync is additive (pull new, push new).
