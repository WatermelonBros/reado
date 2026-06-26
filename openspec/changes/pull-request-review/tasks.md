> The **GitHub adapter** for `guided-pair-review`: open a PR as a review *source*
> (fetch + check out so the guided review reads it), and round-trip the results as
> a *sink* (pull existing threads in, push a **batched review** with a verdict,
> resolve both ways) via the user's **`gh` CLI** — which Reado **auto-installs**
> (confirmed) if missing, reusing the extensions-marketplace install machinery.
> The read-first walk/route/curation/session are `guided-pair-review`, not here.

## 1. GitHub PR as a review source (via `gh`)

- [ ] 1.1 List PRs and open one through `gh`.
- [ ] 1.2 Fetch + checkout the PR branch so a guided review reads it (LSP/navigation/files).

## 2. Required-CLI provisioning

- [ ] 2.1 Detect whether `gh` is installed; if missing, prompt to install (never silent).
- [ ] 2.2 On confirm, run the OS-appropriate install command (reuse
      `src/lib/extensions.ts` install machinery) and verify `gh` works.
- [ ] 2.3 Keep the provisioning generic so `glab` (GitLab) can slot in later.

## 3. Unified comments + pull

- [ ] 3.1 Pull the PR's existing review threads via `gh`.
- [ ] 3.2 Render pulled threads in the guided review's inbox as anchored comments
      with author + a "GitHub" origin badge, alongside local comments.

## 4. Batched review + verdict

- [ ] 4.1 Accumulate the session's PR comments into a pending review (nothing posted yet).
- [ ] 4.2 Submit as one GitHub review with a verdict (Approve / Request changes / Comment).

## 5. Resolution sync (bidirectional)

- [ ] 5.1 Resolve/reopen in Reado → resolve/reopen the GitHub conversation.
- [ ] 5.2 Pull GitHub resolved state → reflect it in Reado on refresh.

## 6. Glue

- [ ] 6.1 i18n strings (EN + IT): PR picker, verdict actions, sync state, install prompt.
- [ ] 6.2 Tests: `gh` detection + install verify; thread pull/badge mapping;
      batched submit; resolution round-trip.
