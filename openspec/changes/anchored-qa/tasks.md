## 1. Ask flow + prompt

- [ ] 1.1 Add a `qa` note kind alongside the existing task/note flag in the comment type model (`src/lib/comments.ts` / store types), so a Q&A note carries `question` and `answer` fields in front-matter.
- [ ] 1.2 `composeAskPrompt(file, startLine, endLine, code, question)` in `src/lib/review.ts`: single prompt citing `file:line`, embedding the selection and the user's question, instructing the agent to answer grounded in the code and record it as a `qa` note via the `reado` CLI anchored to the selected lines.
- [ ] 1.3 Action: read the editor selection (fallback to symbol/line at cursor), open a small question input, then submit the composed prompt to the focused pane via `submitToTerminal`.

## 2. Persistence + anchoring

- [ ] 2.1 Persist the Q&A as a `qa` `.md` file under `.reado/comments/` reusing the comment file schema (id, kind `qa`, anchor file/range, context snapshot, question, answer, timestamps); the `.md` file is the source of truth.
- [ ] 2.2 Reuse the existing anchoring/orphan + reanchor model so a Q&A note tracks its code across edits and is flagged orphaned if its anchor is lost.
- [ ] 2.3 Index `qa` notes in the SQLite cache so they rebuild from markdown like other comments.

## 3. Revisit + affordances

- [ ] 3.1 Render anchored Q&A notes in the gutter/overlay on their file; opening one shows the question and the saved answer (read-only).
- [ ] 3.2 List/filter Q&A notes in the Comments side-panel tool so they can be browsed and revisited across the project.
- [ ] 3.3 Selection context-menu item "Ask about selection" + composer affordance, command palette entry, and Edit/Selection menu entry.
- [ ] 3.4 i18n strings (EN + IT) in `src/i18n/locales/en.json|it.json`.

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green; asking a question records an anchored `qa` note that renders in the overlay and is revisitable from the list.
