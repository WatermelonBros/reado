> Generation runs through the **terminal agent**: the prompt asks it to write a
> Q&A note to `.reado/qa/<file>__L<line>.md`; Reado polls + renders it in a modal.

## 1. Ask flow + prompt

- [x] 1.1 `askAboutSelection` (docInfo): captures the selection's line range,
      prompts for a question, dispatches the agent, opens the modal.
- [x] 1.2 Triggered from the Selection menu ("Ask AI about Selection…") and the
      command palette. Explicit trigger; requires a typed question.

## 2. Persistence + anchoring

- [x] 2.1 The answer is a durable Markdown note anchored to the file + start line
      (`.reado/qa/<file>__L<line>.md`), written by the agent and read back.
- [~] 2.2 Distinct from one-off "Explain selection": durable, anchored, question-
      driven. (A QA list panel / gutter marker for browsing prior notes is
      DEFERRED — the notes persist on disk and re-asking a line reopens it.)

## 3. Revisit + UI

- [x] 3.1 `QaModal` renders the Q&A Markdown, with loading/error states.
- [ ] 3.2 Dedicated revisit panel / gutter affordance — DEFERRED (see 2.2).

## 4. Verify

- [x] 4.1 EN + IT (`qa.*`); typecheck + cargo check + build green.
