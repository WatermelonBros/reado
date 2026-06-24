## 1. Activity feed store

- [ ] 1.1 `src/lib/activity.ts`: an activity store with `ActivityEntry` (path, kind: create|modify|delete, lastTouchedAt, relatedCommentIds) and a rolling, capped, newest-first list.
- [ ] 1.2 Subscribe to the existing file-watcher event stream (from `src-tauri/src/watcher.rs`); coalesce rapid edits to the same path into one rolling entry.
- [ ] 1.3 Gate attribution on review state: only treat mutations as agent activity while/after a review has been dispatched (reuse the dispatch signal from `src/lib/review.ts` / `src/lib/agents.ts`).

## 2. Comment mapping

- [ ] 2.1 For each changed file, resolve the open/dispatched comment(s) anchored in it via `src/lib/comments.ts`; attach their ids to the entry as best-effort "likely resolves" links.
- [ ] 2.2 Keep the link advisory (clearly labeled as likely, not "resolved"); do not mutate comment state.

## 3. Panel UI

- [ ] 3.1 Add `"activity"` to `WorkspaceState.Tool` in `src/lib/store.ts` and register the sidebar entry/icon.
- [ ] 3.2 `ActivityPanel` component: live, newest-first list of entries with path, change kind, relative time, and the mapped comment(s); semantic tokens (`bg-surface`, `text-ink/muted`, `border-line`, `accent`).
- [ ] 3.3 Navigation-only affordances: click an entry to open the file (and reveal lines/comment when known); calm empty state when there is no activity.
- [ ] 3.4 i18n EN + IT (`src/i18n/locales/en.json|it.json`): panel title, empty state, change-kind labels, "likely resolves" label.

## 4. Read-only guarantee

- [ ] 4.1 Audit the panel for any control that submits to a terminal/agent; ensure none exist (no `submitToTerminal`-style calls from this surface).

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green; while a review runs, agent edits appear live in the panel, each navigable and showing its likely-related comment(s), with no agent-driving controls.
