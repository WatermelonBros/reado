## 1. Cache + backend

- [ ] 1.1 `src-tauri/src/onboarding.rs`: read/write/delete the cached overview at `.reado/onboarding.json` (gitignored like the rest of `.reado/`).
- [ ] 1.2 Persist generation metadata with the overview: timestamp + the commit/HEAD it was generated against (for staleness).
- [ ] 1.3 Tauri commands to load, save, and clear the cached overview; register them in `src-tauri/src/lib.rs`.

## 2. Generation (explicit)

- [ ] 2.1 `src/lib/onboarding.ts`: `composeOverviewPrompt(project)` asking the agent for a repo-level overview (summary, architecture, entry points, key modules/dirs + how they connect) in a structured, link-resolvable shape.
- [ ] 2.2 Wire generation through the existing agent contract (`src/lib/agents.ts`); generation runs only on explicit user action.
- [ ] 2.3 Load/save/clear helpers in `onboarding.ts` over the Tauri commands.

## 3. Panel + navigation

- [ ] 3.1 Add `"onboarding"` to the `Tool` union in `src/lib/store.ts` and register the side-panel tool.
- [ ] 3.2 Onboarding panel: render the overview (summary, architecture, entry points, key modules) calmly with semantic tokens.
- [ ] 3.3 Navigable links: each entry point / module opens the referenced file or reveals the directory in the tree.
- [ ] 3.4 Empty state with a "Generate repo overview" action; command palette / Command Center entry.

## 4. Staleness + regenerate

- [ ] 4.1 Show generated-at + commit; flag "possibly stale" when HEAD has moved, without auto-regenerating.
- [ ] 4.2 "Regenerate" action re-runs generation and replaces the cache.

## 5. Linkable into a tour

- [ ] 5.1 Expose stable anchors (entry points / modules) so a reading-tour can reference them.

## 6. i18n

- [ ] 6.1 EN + IT copy for the panel, actions, empty state, and staleness notice (`src/i18n/locales/en.json|it.json`).

## 7. Verify

- [ ] 7.1 typecheck + cargo check + build green.
