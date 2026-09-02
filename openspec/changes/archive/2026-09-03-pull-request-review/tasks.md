> The **provider-aware forge adapter** for `guided-pair-review`: detect the host
> from the `origin` remote (GitHub/GitLab/…), open a PR/MR as a review *source*
> (fetch + check out so the guided review reads it), and round-trip the results as a
> *sink* (pull existing threads, push a **batched review** with a verdict, resolve
> both ways) via the matching CLI (`gh`/`glab`) — auto-installed (confirmed) if
> missing. The read-first walk/route/curation/session are `guided-pair-review`.

## 1. Provider registry + detection

- [x] 1.1 Provider registry: each adapter declares host pattern, tool, install
      command, PR/MR ops + verb. Ship **GitHub (`gh`)** + **GitLab (`glab`)**;
      structured so Bitbucket, Gitea (`tea`), Azure DevOps (`az repos`), self-hosted
      slot in later.
- [x] 1.2 Detect the forge from the `origin` URL and pick its adapter.
- [x] 1.3 Fallback: no adapter / unknown host / no remote → the local guided review
      still works; surface the host round-trip as unavailable (don't fail).

## 2. PR/MR as a review source

- [x] 2.1 List + open a request via the detected CLI (`gh pr` / `glab mr`).
- [x] 2.2 Fetch + checkout its branch so a guided review reads it (LSP/navigation/files).

## 3. Matching-CLI provisioning

- [x] 3.1 Detect whether the forge's CLI (`gh`/`glab`) is installed; if missing,
      prompt to install **that** one (never silent).
- [x] 3.2 On confirm, run the OS-appropriate install command (reuse
      `src/lib/extensions.ts` machinery) and verify it works.

## 4. Unified comments + pull

- [x] 4.1 Pull the request's existing review threads via the CLI.
- [x] 4.2 Render them in the guided review's inbox as anchored comments with author
      + a host origin badge ("GitHub"/"GitLab"), alongside local comments.

## 5. Batched review + verdict

- [x] 5.1 Accumulate the session's comments into a pending review (nothing posted yet).
- [x] 5.2 Submit as one host review with a verdict (Approve / Request changes /
      Comment on GitHub; the GitLab equivalent).

## 6. Resolution sync (bidirectional)

- [x] 6.1 Resolve/reopen in Reado → resolve/reopen the host conversation.
- [x] 6.2 Pull host resolved state → reflect it in Reado on refresh.

## 7. Glue

- [x] 7.1 i18n strings (EN + IT): PR/MR picker, verdict actions, sync state, install prompt.
- [x] 7.2 Tests: forge detection from URL; CLI detection + install verify; thread
      pull/badge mapping; batched submit; resolution round-trip.
