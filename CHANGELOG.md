# Changelog

All notable changes to Reado are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under **[Unreleased]** as work lands; when a release is cut,
that section is renamed to the new version and its bullets ship in the release
commit.

## [Unreleased]

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

[Unreleased]: https://github.com/WatermelonBros/reado/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/WatermelonBros/reado/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/WatermelonBros/reado/releases/tag/v0.17.0
