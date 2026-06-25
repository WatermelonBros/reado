> Bring a whole branch or GitHub PR into the read-first reader: **fetch + check
> out** so LSP/navigation/file reads work, comment with **two-way GitHub sync**
> (pull existing threads, push a **batched review** with a verdict, resolve both
> ways) via the user's **`gh` CLI** — which Reado **auto-installs** (confirmed) if
> missing, reusing the extensions-marketplace install machinery.

## 1. Branch review

- [ ] 1.1 "Review a branch / PR" entry (palette + git panel): pick a local branch + base.
- [ ] 1.2 Check out the branch; compose the diff vs the base and present it for review.
- [ ] 1.3 Local-branch comments stay in `.reado/` (no push when no PR is attached).

## 2. GitHub PR (via `gh`)

- [ ] 2.1 List PRs and open one through `gh`.
- [ ] 2.2 Fetch + checkout the PR branch so LSP/navigation/file-read all apply.

## 3. Required-CLI provisioning

- [ ] 3.1 Detect whether `gh` is installed; if missing, prompt to install (never silent).
- [ ] 3.2 On confirm, run the OS-appropriate install command (reuse
      `src/lib/extensions.ts` install machinery) and verify `gh` works.
- [ ] 3.3 Keep the provisioning generic so `glab` (GitLab) can slot in later.

## 4. Unified comments + pull

- [ ] 4.1 Pull the PR's existing review threads via `gh`.
- [ ] 4.2 Render pulled threads as anchored comments with author + a "GitHub"
      origin badge, in the same panel as local comments.

## 5. Batched review + verdict

- [ ] 5.1 Accumulate PR comments into a pending review (nothing posted yet).
- [ ] 5.2 Submit as one GitHub review with a verdict (Approve / Request changes / Comment).

## 6. Resolution sync (bidirectional)

- [ ] 6.1 Resolve/reopen in Reado → resolve/reopen the GitHub conversation.
- [ ] 6.2 Pull GitHub resolved state → reflect it in Reado on refresh.

## 7. Glue

- [ ] 7.1 i18n strings (EN + IT): entry, verdict actions, sync state, install prompt.
- [ ] 7.2 Tests: branch diff/checkout; `gh` detection + install verify; thread
      pull/badge mapping; batched submit; resolution round-trip.
