## Why

Reado reviews the *uncommitted* diff today (AI pre-review). But real review happens
on a **branch** or a **pull request** — and that's exactly the read-first job Reado
should own: walk a whole change file by file, leave durable anchored comments, and
let the agent resolve them. The missing piece is bringing a branch/PR *into* the
reader with the full experience (LSP, navigation, real file reading), and
round-tripping with GitHub so a review done in Reado is a real PR review.

The loop should be two-way: pull the PR's existing threads into Reado so nothing
is lost, accumulate your own comments into a pending review, submit it as one
GitHub review with a verdict, and keep resolution in sync both ways. Auth piggybacks
on the user's **`gh` CLI** — and if it isn't installed, Reado installs it for them
(the same machinery the extensions marketplace already uses for language servers),
so the feature works without a manual setup detour.

## What Changes

- Add a **"review a branch / PR"** entry. The user picks a **local branch** (diff
  against a chosen base) or a **GitHub PR**. Reado **fetches and checks out** the
  branch so LSP, navigation, and file reading all work over the change.
- Add **GitHub integration via the `gh` CLI**: list PRs, open one, pull its review
  threads, submit a **batched review** with a verdict, and resolve/unresolve
  conversations.
- Add **required-CLI provisioning**: when `gh` (or, later, `glab`) is missing,
  Reado offers to install it and runs the correct per-OS command — reusing the
  extension-install machinery (`src/lib/extensions.ts`) — then verifies it works.
  Installation runs only on the user's confirmation, never silently.
- **Unify comments**: pulled GitHub threads appear as normal anchored comments in
  the same panel, with the author and a **"GitHub" origin badge**; local `.reado/`
  comments and pulled threads live in one inbox.
- **Bidirectional sync**: pull existing PR threads; accumulate local comments into
  a **pending review** submitted as one GitHub review (**Approve / Request changes
  / Comment**); resolving a thread in Reado resolves the conversation on GitHub and
  vice-versa.
- i18n strings (EN + IT) for the entry, the verdict actions, sync state, and the
  CLI-install prompt.

## Capabilities

### Added Capabilities
- `pull-request-review`: review a local branch or a GitHub PR read-first — fetch & check out the change, comment with two-way GitHub sync, and submit a batched review with a verdict; Reado installs the required CLI if missing.

## Out of Scope

- GitLab (`glab`) review. The CLI-provisioning is built generic so `glab` slots in
  later, but GitLab PR review itself is a later capability.
- Other providers (Bitbucket, Gitea, etc.).
- Editing code on the PR inline. Reado stays read-first; edits happen through the
  agent / the desktop editor as usual.
- Conflict resolution beyond additive sync and last-write — Reado pulls new threads
  and pushes new comments; it does not attempt three-way merge of edited comment text.
- Silent/automatic CLI installation; every install is user-confirmed.
