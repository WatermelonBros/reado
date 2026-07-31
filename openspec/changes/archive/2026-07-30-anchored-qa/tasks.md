> Generation runs through the **terminal agent**: the prompt asks it to write a
> Q&A note to `.reado/qa/<id>.md`; Reado polls + renders it. A frontend index
> (`.reado/qa.json`) records each note for the browse/revisit panel.

## 1. Ask flow + prompt

- [x] 1.1 `askAboutSelection` (docInfo): captures the selection's line range,
      prompts for a question, dispatches the agent, opens the modal.
- [x] 1.2 Triggered from the Selection menu ("Ask AI about Selection…") and the
      command palette. Explicit trigger; requires a typed question.

## 2. Persistence + anchoring

- [x] 2.1 The answer is a durable Markdown note anchored to the file + start line
      (`.reado/qa/<id>.md`), written by the agent and read back.
- [x] 2.2 A frontend index (`.reado/qa.json`) records each note (file, line,
      question, time), upserted by anchor (re-asking a line updates in place);
      loaded on project open. Distinct from one-off "Explain selection".

## 3. Revisit + UI

- [x] 3.1 `QaModal` renders the Q&A Markdown, with loading/error states.
- [x] 3.2 `qa` Tool + `QaPanel`: notes grouped by file, click revisits (opens the
      file at the line and shows the answer), with a per-note remove. ActivityBar
      entry appears when notes exist.

## 4. Verify

- [x] 4.1 EN + IT (`qa.*`); typecheck + cargo check + build green.
