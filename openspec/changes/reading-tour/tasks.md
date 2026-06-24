## 1. Tour data model & persistence

- [ ] 1.1 Define the tour artifact: `{ id, title, description, steps: [{ id, path, line?, endLine?, note }] }`; document the JSON shape.
- [ ] 1.2 Rust storage in `src-tauri/src` (e.g. `tours.rs`): read/write tour files under `.reado/tours/*.json`; list tours for a project; create/update/delete; register Tauri commands.
- [ ] 1.3 Keep tour files out of the gitignored cache paths so a project can opt in to committing them; ensure the watcher ignores writes the same way it does for comments/index.
- [ ] 1.4 Frontend API in `src/lib` (e.g. `tours.ts`/`api.ts`): list/load/save/delete tours; types mirroring the artifact.

## 2. Step-through navigation UI

- [ ] 2.1 Add `tours` to `WorkspaceState.Tool` in `src/lib/store.ts` and a side-panel entry listing available tours.
- [ ] 2.2 Tour reader: open a tour, show the active step's note calmly, with next/prev controls and a step indicator (e.g. "2 of 7").
- [ ] 2.3 Selecting/advancing a step reveals the step's file and scrolls/highlights its line/region in the editor, themed with existing tokens (no new chrome).

## 3. AI-generated tour

- [ ] 3.1 Add an explicit trigger (Command Center / command palette action + tours-panel button) to request a tour for the repo or a named feature.
- [ ] 3.2 Dispatch the request to the terminal AI agent via `src/lib/agents.ts`; write the agent's proposed tour as an editable tour artifact for review.

## 4. Manual create / edit

- [ ] 4.1 Create a new tour (title + description) and delete tours.
- [ ] 4.2 Add a step anchored to the current selection or open file; edit a step's note; reorder and remove steps.
- [ ] 4.3 i18n EN+IT copy for all tour UI strings (`src/i18n/locales/en.json|it.json`).

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green.
