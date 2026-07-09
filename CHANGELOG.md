# Changelog

All notable changes to Reado are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under **[Unreleased]** as work lands; when a release is cut,
that section is renamed to the new version and its bullets ship in the release
commit.

## [Unreleased]

## [0.19.0] — 2026-07-09

A correctness-and-polish release: Git Sync with conflict reporting, VS Code-style
search toggles, drag-to-reorder, a reading-coverage map, calmer error toasts, and
a broad "no control is a dead end" pass across the palette, app menu and panels.

### Added
- **Git Sync** (VS Code's "Synchronize Changes"): one action that pulls then
  pushes the current branch. The source-control toolbar shows the pending
  ahead/behind counts (↓ to pull, ↑ to push) next to it. If the pull hits a merge
  conflict, the sync stops before pushing and tells you how many files need
  resolving — they show in the changes list with the conflict badge.
- The source-control toolbar now reflects what the remote actually allows: Fetch
  and Pull are disabled with no remote configured, and Push is disabled when
  there's nothing ahead to push (it stays enabled to publish a branch that has no
  upstream yet).
- VS Code-style search toggles in **both** the project search and the in-editor
  find: match case (`Aa`), whole word (`ab`), and regex (`.*`).
- Multi-line search and replace: **Shift+Enter** inserts a newline (search across
  several lines at once); ripgrep switches to multi-line matching for the project
  search.
- The in-editor find panel is rebuilt to match: arrow buttons for previous/next,
  icon replace / replace-all, and the same toggles as the global search.
- **Drag to reorder** the activity-bar tools (left rail) and the open editor tabs
  (pointer-based, since the Tauri webview reserves HTML5 drag for OS file drops);
  the activity-bar order is remembered, and items slide into place with a FLIP
  animation (respecting reduce-motion).
- Active icon toggles now read consistently as accent-coloured (with duotone
  weight where an icon): the activity-bar tool, the breadcrumb blame/diff toggles,
  show-hidden-files, and the search match-case / whole-word / regex toggles (which
  move from a solid fill to an accent tint, matching VS Code).
- Move files/folders in the tree by dragging them onto a folder, and delete them
  (to the project trash) from the context menu — both reversible with **Ctrl/Cmd+Z**.
- Failures that used to be swallowed silently now surface a calm, dismissible
  toast (bottom-centre): a failed save, a broken file watcher, a failed default-app
  or delete. Toasts stack (two at once no longer erase each other) and animate in
  and out, respecting reduce-motion.
- **Reading coverage** panel: a reading map of the project — overall files-read
  percentage, a per-folder breakdown (largest areas first), and a
  "changed since read" list of files the agent (or an external edit) touched after
  you'd read them. Bars grow to their value with a calm transition (reduce-motion
  honoured).

### Changed
- Shared UI atoms to cut hand-rolled markup, now adopted across the app: `Button`
  (text actions), `IconButton` (every clickable icon — required accessible label +
  an Ark-based tooltip), `Tooltip`, `Input`, `Textarea` (with the shared
  Cmd/Ctrl+Enter-submit / Escape-cancel behaviour), and `Badge` (count pills). All
  raw `<input>`/`<textarea>` and the repeated count pills are gone; text and icon
  buttons across the panels, dialogs, breadcrumb and toolbars now use the atoms.
  A `cn()` helper (tailwind-merge) lets each atom carry full defaults that call
  sites override cleanly. `QrCode` and `SegmentedControl` are built on Ark UI, and
  the Phosphor set imports the non-deprecated `*Icon` exports. (Dropped the unused
  `qrcode` dependency.)
- The editor is no longer one 1,866-line file. It's decomposed into an `editor/`
  folder — a ~275-line `Editor.tsx` orchestrator plus `extensions.ts` (CodeMirror
  state fields / goto-definition / extension builders + a `useReconfigure` helper),
  `buildCodeExtensions.ts` (the editor's extension assembly), `CodeOverlays.tsx`
  (the composer/thread/peek/sticky/save-error overlays as components) and
  `RenderedMarkdown.tsx`. `CodeView.tsx` (the core viewer) drops from 1,338 to
  ~1,080 lines — all with no behaviour change.
- Language servers are now more resilient: their stderr is captured to the log
  (it was discarded, making a broken server impossible to diagnose), and a server
  that crashes now surfaces a single calm notice and reconnects on your next file
  interaction instead of silently breaking completions and diagnostics.
- The LSP-free workspace symbol picker (Cmd/Ctrl+T) and go-to-definition are now
  backed by an in-memory symbol index keyed by file mtime: unchanged files are no
  longer re-read and re-scanned on every lookup, so navigation stays fast as the
  repository grows (results and ranking are unchanged).

### Fixed
- **The command palette (Cmd/Ctrl+K) now lists only applicable commands.** Every
  command showed regardless of context — "New comment on selection" with nothing
  selected, "Format document" with no file open, "Clear terminal" with no
  terminal, back/forward with no history, "Reopen closed tab" with none closed,
  git-scoped reviews outside a repo, "Go to bookmark" with no bookmarks. Each
  command is now gated on its precondition (selection / open file / git repo /
  terminal / history / closed tab / split / bookmark) and hidden when it wouldn't
  do anything.
- **App-menu commands report why they're unavailable instead of doing nothing.**
  Menu items with an unmet precondition (Save/Format with no file, Back/Forward at
  the ends of history, Reopen Closed Editor with none, Explain Selection with no
  selection, terminal or problem commands with none) used to silently no-op. The
  rendered menu bar (Windows/Linux) now greys them out, and every surface — the
  native macOS menu included — shows a short "why" notice instead of a dead click.
- **More context-aware UI, so no control is a dead end.** Following the palette
  audit, the same "don't offer what can't act" rule now covers: the quick-open
  overlay shows a per-mode empty state (no symbols / no files / no bookmarks / no
  recents) instead of a blank box; the git panel's *Stash* / *Stash untracked*
  entries disable on a clean working tree (matching the adjacent *Discard all*);
  the file-tree folder context menu only offers *Mark folder read* / *unread* in
  the direction that would change something (and neither on an empty folder);
  *Format document* is hidden on a read-only PR-pinned buffer (where the save is a
  no-op); and *Send review to agent* from the app menu now reports "no open tasks"
  instead of dispatching an empty review (matching the panel buttons).
- **Panel resizing is now correct under interface zoom.** Dragging the sidebar or
  terminal-panel edge, and the min-size clamps, mixed viewport (visual) pixels with
  layout pixels, so at zoom ≠ 1 the panels resized by the wrong amount. All the
  drag handlers and clamps now convert by the zoom factor. (Ratio-based dividers —
  terminal split panes, graph-node drag — were already zoom-correct.)
- **The terminal now behaves correctly under interface zoom.** Selecting/copying
  text landed on the wrong cells because the terminal was scaled by the
  interface-zoom CSS transform, which xterm's mouse→cell mapping doesn't account
  for. The terminal now takes its zoom from the font size (with the host
  counter-scaled to a net-1 transform), so selection, clickable links and fit stay
  accurate.
- **A free-text review request now starts a real guided-review workflow.** Picking
  the "describe what to review" source used to bypass the session machinery and
  just fire a one-off prompt that scattered anchored comments — no route, no
  proposals, no verdict. It now creates a guided-review **session** scoped to the
  request (new `prompt` scope kind carrying the text), so every review method
  (diff / branch / PR / free-text) produces the same structured workflow.
- **Reado Anywhere loaded as an empty shell** (styled page, header, but blank tab
  bar and body). The mobile page's Content-Security-Policy used `script-src 'self'`,
  which blocks the app's inline `<script>` — so the client never initialized. The
  CSP now allows that one script by its SHA-256 hash (computed from the served HTML
  so it can't drift), keeping the policy strict. A test guards that the served CSP
  always carries the inline script's hash.
- Go to line (status bar): entering a line no longer leaks the Enter keypress into
  the editor as a stray newline — which shifted the target line by one and falsely
  marked the file as modified (with a spurious save error).
- File-tree drag now works in the Tauri webview and is correct under interface
  zoom (it used HTML5 drag, which the OS drop handler hijacks and which mis-targets
  when zoomed — it now uses pointer events with viewport hit-testing).
- Settings sync no longer silently drops preferences: the export bundle now
  carries every machine-independent setting (file icons, structure ribbon,
  show-hidden, logging, review objective, …) instead of a hand-maintained
  whitelist that drifted out of date — a test now guards that every field is
  classified.
- Side-panel headers for the Problems, Bookmarks, Hierarchy, Timeline, Q&A,
  Tours, AI-review and Guided-review tools now show their proper title (they
  previously rendered an empty header).
- Project-wide replace now honours your exclude-from-search globs, so it can't
  rewrite files you've hidden from search.
- Opening a very large file no longer reads it fully into memory before rejecting
  it — the size cap is now checked from file metadata first.
- The `git blame` cache is now bounded, so a long session over many files can't
  grow it without limit.
- Files shorter than the viewport are now auto-marked read: they fire no scroll,
  so the "scrolled to the bottom" trigger never ran and they stayed unread with no
  way to scroll them. They're now marked read after a short dwell once fully
  visible (a late layout that turns out scrollable still falls back to the
  scroll-to-bottom rule).
- Context menus now open exactly under the pointer. They render through a portal
  to `document.body` so they escape the interface-zoom transform layer — a
  transformed ancestor made `position: fixed` relative to that box (offset by the
  title bar, and mis-scaled at zoom ≠ 1) instead of the viewport.

## [0.18.0] — 2026-07-07

A large settings expansion (three phases) plus an icon, tooltip and file-handling
overhaul.

### Added
- "Open with Reado" for text and source files: the app registers as a handler for
  ~60 text/code extensions, and opening such a file launches it at its project
  root (the enclosing git repo, else the file's folder). Works on cold launch and
  while running, across macOS/Windows/Linux.
- A first-run prompt (and a Settings button) to make Reado the default app for
  text files — one click on macOS (Launch Services), the system chooser on
  Windows, best-effort `xdg-mime` on Linux.
- Phosphor icon set across the whole UI, replacing the hand-rolled SVGs (brand
  marks for Claude/Codex/Copilot/Gemini/OpenCode/Discord stay bespoke).
- App-wide hover tooltips for icon buttons — surfaced in JS because the Tauri
  webview doesn't render native `title` tooltips.
- Animated segmented controls: the active-tab indicator slides between segments
  (Comments open/history, Hierarchy direction, Settings tabs).
- **Editor reading controls**: adjustable font size and line height, line numbers
  (off / absolute / relative), active-line emphasis, indent guides, bracket-match
  highlight, per-file-type icons (off / monochrome / colored), and a line-length
  ruler.
- **Block-aware focus mode**: dims everything except the function / tag / scope
  around the caret (previously a single line).
- **Interface controls**: preset interface zoom, reduce motion (follow OS / on /
  off), cursor style and blink, editor tab-strip mode (multiple / single /
  hidden), and scrollbar visibility.
- **Auto-hide activity bar**: when hidden it collapses to a hover-revealed rail
  and the layout reflows from three columns to two.
- **Review controls**: hide resolved comments, and toggle inline diagnostic
  squiggles (the Problems panel and tree counts are unaffected).
- **Files controls**: exclude-from-tree/search globs (composed with `.gitignore`),
  a restore-session toggle, and opt-in save hygiene (trim trailing whitespace /
  final newline).
- **Specs panel**: a filter box, manual refresh, collapsible changes (collapsed by
  default) with collapse/expand-all, and live refresh as spec files change on disk.

### Changed
- Settings redesign: a tabbed sidebar (Appearance · Editor · Interface · Files ·
  System) with uppercase section headers, aligned gutters, grouped System
  sections, and a one-line description on each reading-aid toggle.
- Tuned default editor settings (JetBrains Mono 12px, line height 1.65, ruler at
  120, line numbers on, active line and indent guides on, auto-save after a pause,
  word wrap / sticky scroll / bracket matching / structure ribbon on).
- Code now uses the full editor width; the old "reading width" toggle was removed
  (rendered Markdown keeps a comfortable measure).

### Fixed
- Open Folder and recent-project entries now open in the current window when it's
  empty, and only prompt (this window / new window) when a project is already
  open — instead of silently replacing it.
- AI prompts submit reliably when the agent was just launched: a freshly booted
  terminal agent could swallow the first Enter, leaving the prompt unsent.
- Editor font size now actually resizes the text; the active line's gutter number
  is clearly highlighted; block and underline cursor styles render correctly.

## [0.17.0] — 2026-07-05

### Added
- In-place, non-destructive PR/MR review.
- Discord community links.

### Fixed
- Auto-load guided-review PRs and stop swallowing forge/list errors.
- Restore the best-effort `cli_out` helper after the forge-list refactor.

## [0.16.0] — 2026-07-03

### Added
- Multi-agent MCP support.
- Free-text review.
- File-type icons in the tree.

### Fixed
- Markdown HTML rendering.
- Linux startup freeze.

## [0.15.0] — 2026-07-02

### Changed
- UX friction pass: resilience and correctness fixes plus an audit cleanup.

## [0.14.0] — 2026-06-30

### Added
- Rich diagnostic logging engine (with a Diagnostics settings section).
- Cross-OS tooling, repo onboarding, knowledge base, and a full test suite.

### Fixed
- Logging scrubs home paths mid-string, not only as a prefix.

## [0.13.0] — 2026-06-26

### Added
- Guided pair review from your phone (Reado Anywhere).

### Fixed
- Guided review keeps edited comments; reworked "second opinion" vs "respond".

## [0.12.0] — 2026-06-26

### Added
- Forge thread-pull pagination with a report of dropped threads.

### Fixed
- AI prompts are sent when the agent is actually ready, not after a fixed 4s.
- Long unbroken tokens wrap instead of overflowing the review sidebar.
- Clear separation of file navigation vs review; advance and open the next file.

## [0.11.0] — 2026-06-26

### Added
- Reado Anywhere: review from your phone over the LAN.

### Fixed
- Dark hover doc; title bar stays fixed under interface zoom (0.11.1).
- Vendor xterm assets instead of reading from `node_modules` (0.11.2).

## [0.10.0] — 2026-06-25

### Added
- Editor scrollbar overview ruler and a hover "explain" chip.
- Project search seeds from the editor selection.
- Terminal copy/paste shortcuts.

### Fixed
- Mouse back/forward buttons walk the read-history.
- Always launch an agent for AI prompts; Shift+Enter newline in the terminal.

## [0.9.0] — 2026-06-25

### Added
- Auto-start the last-used agent for AI prompts (Activity panel dropped).

### Fixed
- Icon-only button tooltips and git "more" menu positioning.
- Knowledge-graph simulation cool-down.

## [0.8.0] — 2026-06-25

### Added
- On-demand AI file synopsis modal (via the terminal agent).
- Anchored Q&A about a selection, with a browse/revisit panel and index.
- AI repo onboarding overview.
- Guided reading tours (manual and AI-generated).
- AI pre-review of changes into draft comments.
- Comment ↔ agent resolution loop.
- Natural-language semantic search (via the terminal agent).
- Reado MCP server with opt-in enablement.
- Call & type hierarchy panel (LSP).
- Per-file git history (timeline) panel.
- Project diagnostics (problems) panel.
- Reading bookmarks with gutter, panel, and palette jump.
- Structure overview ribbon.
- Test runner panel (discover + run in terminal).
- Review only what changed since you last read a file (read-delta).
- Export/import a settings bundle via the clipboard.
- Git blame cached per (file, HEAD), enriching the hover.

### Fixed
- Sanitize user free-text in AI terminal prompts.
- Title bar dragging/clicks on Windows/Linux; launcher drag region.

## [0.7.0] — 2026-06-24

### Added
- Rendered menu bar in the Windows/Linux title bar.

### Fixed
- macOS title overlap and hidden `.env` files showing in the tree.

## [0.6.0] — 2026-06-23

### Added
- Custom title bar, VS Code menu parity, LSP navigation, and multi-window hardening.

## [0.5.0] — 2026-06-22

### Added
- LSP phase 2 and a declarative extension marketplace.

### Fixed
- Match the native title bar to the active theme.
- PowerShell / Windows-compatible agent launch commands.

## [0.4.0] — 2026-06-22

### Added
- Language servers (LSP), richer Git, a navigable terminal, i18n via
  react-i18next, and security hardening.

## [0.3.0] — 2026-06-22

### Added
- Keyboard shortcuts reference panel.

## [0.2.0] — 2026-06-22

### Added
- Explain selection with the agent.
- Mark files read + reading-progress tracking.
- Peek Definition and Workspace Symbols (Cmd+T).
- Reading aids: occurrence highlight, indent guides, syntax-aware selection.

### Fixed
- Theme indentation guides with the real border token (0.2.1).

## [0.1.0] — 2026-06-20

Initial public releases (0.1.0 – 0.1.19).

### Added
- Open projects in the same window; File menu Open/Close Folder.
- Bundle the `reado` CLI in the app with install-on-PATH.
- Spec and doc nodes in the knowledge graph.
- Custom copy/paste menu (native context menu dropped).
- Git branch switcher in the status bar.
- Custom in-app update UI (modal, indicator, toast).
- First-class GitHub Copilot support.
- Solidity syntax highlighting.
- Multi-pane terminal with a right-click context menu and an expanded native menu.
- A real image viewer.

### Fixed
- Native webview zoom instead of CSS zoom.
- Project-window permissions and a render loop; per-project config.
- Full-width status bar with a left-truncated path.
- Persist terminal dock position and size across restarts.

[Unreleased]: https://github.com/WatermelonBros/reado/compare/v0.19.0...HEAD
[0.19.0]: https://github.com/WatermelonBros/reado/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/WatermelonBros/reado/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/WatermelonBros/reado/releases/tag/v0.17.0
