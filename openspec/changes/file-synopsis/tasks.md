> AI generation runs through the **terminal agent** (Reado's AI model): a prompt
> asks the agent to write the synopsis to `.reado/synopsis/<file>.md`; Reado polls
> for that file and renders it. No direct LLM client.

## 1. Cache

- [x] 1.1 Synopsis cached on disk at `.reado/synopsis/<sanitized-path>.md`; a cache
      hit (file present + non-empty) shows immediately. Regenerate re-dispatches.
- [~] 1.2 Content-fingerprint staleness — DEFERRED: cache is path-keyed; the user
      regenerates explicitly. (A source-mtime vs synopsis-mtime check is a later add.)

## 2. Generation (via the agent)

- [x] 2.1 `show(relPath)` dispatches a prompt (`runInTerminal`) telling the agent to
      write the synopsis to the cache path, then polls (~60s) for the file.
- [x] 2.2 Key symbols + purpose are requested in the prompt; the agent has the code.

## 3. UI (button → modal, NOT inline)

- [x] 3.1 A breadcrumb button (Sparkle) opens a `SynopsisModal`; the synopsis is
      never rendered inline at the top of the file.
- [x] 3.2 Modal renders the Markdown (ReactMarkdown), with loading / error states
      and a Regenerate action; built on the themed `Modal` atom.

## 4. i18n + verify

- [x] 4.1 EN + IT (`synopsis.*`).
- [x] 4.2 typecheck + cargo check + build green.
