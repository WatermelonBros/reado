## Why

Guided Pair Review (`guided-pair-review`) brings any change into the read-first
reader — file by file, with durable comments the agent can resolve. This
capability is its **forge adapter**: it makes a hosted pull/merge request both a
*source* for a guided review and a *sink* for its results, so a review done in
Reado is a real PR/MR review on the host.

It is built as an **extensible provider registry**: Reado detects the forge from
the repo's `origin` remote URL and looks up an adapter for it. Each adapter
declares its host pattern, the tool it drives, how to install it, and how to
list/open/pull/submit/resolve. **GitHub (`gh`) and GitLab (`glab`) ship first** —
they have first-class CLIs. Others slot in the same way as their integration lands
(e.g. Gitea via `tea`, Azure DevOps via `az repos`, Bitbucket via its REST API
since it has no first-class CLI).

Crucially, **no repo is left out**: a forge without an adapter yet still gets the
full guided review *locally* (branch scope + durable `.reado/` comments via
`guided-pair-review`) — only the host round-trip (pull threads / submit a review /
sync resolution) requires an adapter, and degrades gracefully when there isn't one.

This capability does **not** re-implement the read-first walk, the route, the
comment curation, or the session — those are `guided-pair-review`. It only opens a
PR/MR for it and round-trips the results to the host.

## What Changes

- Add a **provider registry**: parse the `origin` remote URL to identify the host
  and look up its adapter (host pattern, tool, install command, PR/MR ops + verb).
  **GitHub (`gh`)** and **GitLab (`glab`)** ship as the first adapters; the
  registry is structured so Bitbucket, Gitea (`tea`), Azure DevOps (`az repos`),
  self-hosted instances, etc. can be added later without reworking the rest.
- Add a **graceful fallback**: when the detected forge has no adapter yet (or the
  host can't be inferred — self-hosted), the guided review still runs locally
  (branch scope + `.reado/` comments); only the host round-trip is unavailable, and
  Reado says so clearly rather than failing.
- Add **PR/MR as a review source**: list and open a request through the detected
  CLI (`gh pr` / `glab mr`), then **fetch and check out** its branch so a guided
  review reads it with the full experience (LSP, navigation, real files).
- Add **provider-aware CLI provisioning**: when the CLI the detected forge needs
  (`gh` or `glab`) is missing, Reado offers to install **that** one and runs the
  correct per-OS command — reusing the extension-install machinery
  (`src/lib/extensions.ts`) — then verifies it. Never silent; always user-confirmed.
- **Pull existing threads** into the guided review's comment inbox, each shown as a
  normal anchored comment with its author and a **host origin badge** (e.g. a
  "GitHub" / "GitLab" tag).
- **Submit the session's comments as one batched review** with a verdict — Approve
  / Request changes / Comment on GitHub; the equivalent on GitLab (approve /
  comment). Nothing posted until submission.
- **Bidirectional resolution sync**: resolving a thread in Reado resolves the host
  conversation and vice-versa.
- i18n strings (EN + IT) for the source picker, verdict actions, sync state, and
  the CLI-install prompt.

## Capabilities

### Added Capabilities
- `pull-request-review`: a provider-aware forge adapter for guided reviews — detect the host from the remote, open a PR/MR as a review source (fetch & check out), pull its threads in, submit the session as a batched review with a verdict, and sync resolution; installs the matching CLI (`gh`/`glab`) if missing.

## Out of Scope

- The read-first review experience itself — scope/route/file-by-file/curation,
  sessions, summaries, the CLI session contract. That's `guided-pair-review`.
- Reviewing a **local branch** (no forge) — also a `guided-pair-review` scope; this
  capability is only the hosted round-trip.
- Round-trip adapters beyond GitHub + GitLab (Bitbucket, Gitea, Azure DevOps,
  self-hosted, …): the registry is ready for them, but each adapter is later work.
  Until one lands, those repos use the local guided review (no host round-trip).
- Self-hosted instances where the host can't be inferred from the URL — best-effort
  detection; the user may still point an installed CLI at them via its own config.
- Editing code on the PR/MR inline (Reado stays read-first; edits go via the agent).
- Three-way merge of edited comment text — sync is additive (pull new, push new).
