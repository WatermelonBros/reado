> Sequenced so a usable daily slice ships first. All groups are in MVP scope; the order de-risks the hardest parts and validates the core loop before breadth. Work TDD: each capability's scenarios are the acceptance tests — write them red first.

## 0. De-risking spikes (before building the shell)

- [ ] 0.1 Anchoring spike: plant an anchored comment, subject the file to a day of real edits (reformat, move lines, refactor) made *outside* the tool, measure how many comments stay correctly anchored via git-diff + fuzzy snippet.
- [x] 0.2 Terminal spike: real PTY (portable-pty) streamed to xterm.js in Tauri, interactive input working.
- [x] 0.3 Agent-loop spike: a `reado` CLI stub (`task list`/`task done`) + terminal injection making `claude` read and close a task end-to-end.
- [x] 0.4 Decide thresholds from spike data (fuzzy match confidence, snippet size) and record in design.

## 1. App shell, reading & navigation (`project-workspace`, `code-reading`, `navigation-search`)

- [x] 1.1 Recent-projects screen + open any local folder; one window per project.
- [x] 1.2 File tree respecting `.gitignore` with a "show hidden" toggle.
- [x] 1.3 CodeMirror 6 read-first viewer: Lezer syntax, virtualization, line-wrap toggle.
- [x] 1.4 Reading aids: focus mode, comfortable reading width, breadcrumb + soft landing highlight; no noisy minimap.
- [x] 1.5 Non-code rendering: formatted markdown, images, foldable JSON.
- [x] 1.6 Cmd+P fuzzy file open, full-text ripgrep search, command palette (Cmd+K) + key shortcuts.
- [ ] 1.7 Settings (global + per-project), status bar, session restore (files/tabs/scroll/terminals).
- [x] 1.8 Optional manual editing (read-first remains the design priority).
- [x] 1.9 Tool sidebar: slim icon rail switching the side panel between tools (Files, Search, Comments), collapsible, with reserved slots for later tools.

## 2. Annotation store & anchoring (`annotation-store`, `annotation-anchoring`)

- [x] 2.1 `.reado/` layout + per-comment `.md` schema (YAML front-matter + body); first-comment init + gitignore prompt with "don't ask again"; versioning toggle.
- [ ] 2.2 SQLite index: build on open if absent, incremental updates via watcher; rebuildable from `.md`.
- [x] 2.3 File watcher (notify) over the repo minus gitignored, debounced.
- [ ] 2.4 Anchoring: in-tool live tracking; external-edit remap (git-diff first, fuzzy snippet fallback); tree-sitter AST assist; recompute on watcher + on open.
- [ ] 2.5 Orphans panel + manual re-anchor; file delete → orphan; rename → path auto-update.

## 3. Annotations UX (`annotations`)

- [x] 3.1 Create comment: select lines → dedicated key → inline markdown editor; gutter markers with overlap counter.
- [x] 3.2 Floating popover thread near the line; you + AI messages with per-author identity.
- [x] 3.3 Fixed types (Bug/Refactor/Performance/Question/Note), states (open/in-progress/done/discarded), task-vs-note flag.
- [x] 3.4 Edit + delete (with confirm; delete ≠ archive); line/range/file/project scope.
- [x] 3.5 Comment list with filters (state/type/file) + jump to code.

## 4. AI review loop & terminal (`integrated-terminal`, `ai-review-loop`, `diff-view`)

- [x] 4.1 Multi-tab PTY terminal (zsh login shell), launch buttons for claude/codex.
- [x] 4.2 `reado` CLI full contract: `task list/show/done/fail/link`, `comment add/reply/search`.
- [x] 4.3 Plugin packaging (Claude Code + Codex), install/auto-update by Reado, context injection on each agent launch.
- [x] 4.4 "Send review": batch all open tasks (deselectable) + "send just this now"; choose target agent.
- [x] 4.5 Agent marks done via CLI; watcher reflects it; error → back to open with note in thread.
- [x] 4.6 Diff view on-demand: base picker (working tree / branch / commit), post-hoc snapshot + revert, configurable accept posture.
- [x] 4.7 Cross-review: AI can create/reply to comments on another AI's work, with originating-agent identity/logo.

## 5. Knowledge graph, docs, notifications (`knowledge-graph`, `documentation-views`, `notifications`)

- [x] 5.1 Knowledge graph: nodes = comments + files, edges = manual links + co-location; progress / exploration / doc-source views.
- [x] 5.2 Base documentation views generated from comment history, filterable.
- [x] 5.3 History timeline of archived comments (file/period/type filters).
- [x] 5.4 Notifications: in-app badges + status indicator, OS notification on run completion, optional completion sound.

## 6. Theming from research (`theming`)

- [x] 6.1 Deep research on color theory for prolonged code reading; derive 2-4 scientific palettes (desaturated base, ≤6 semantic colors, comfortable contrast).
- [x] 6.2 Whole-UI theming + live switch; colorblind validation + WCAG AA floor.
- [x] 6.3 Configurable high-legibility code font, chosen with on-screen tests (impeccable phase).

## 7. Cross-platform & distribution

- [x] 7.1 i18n (IT + EN) wiring across the UI.
- [ ] 7.2 Linux validation (PTY/notifications/paths).
- [ ] 7.3 Windows validation (PTY/shell/path) — last, highest cost.
- [x] 7.4 Tauri auto-update.
