## 1. Prompt + injection

- [ ] 1.1 `composeExplainPrompt(file, startLine, endLine, code, asNote)` in `lib/review.ts` (single line; cites file:line; optional "record as a `reado` note" instruction).
- [ ] 1.2 Action: read the editor selection (fallback to symbol/line at cursor), submit to the focused pane via `submitToTerminal`.

## 2. Affordances

- [ ] 2.1 Selection context-menu item "Explain selection" + the "+" composer area, command palette, and Edit/Selection menu entry.
- [ ] 2.2 A toggle/second item for "Explain & save as note".
- [ ] 2.3 i18n (EN + IT).

## 3. Verify

- [ ] 3.1 typecheck + build green; the prompt reaches the focused agent and (when chosen) the agent records an anchored note.
