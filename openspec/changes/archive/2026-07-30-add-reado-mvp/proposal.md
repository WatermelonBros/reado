## Why

Most IDEs are optimized for *writing* code. Yet a large share of senior engineering work is *reading* code — your own, other people's, old code. Reado inverts the focus: the primary experience is **calm reading**, and the primary user action is **leaving comments** anchored to precise points in the code.

Comments are not volatile notes. They are persistent, lifecycle-bearing artifacts that:
- are interpreted by an AI agent (Claude Code / Codex) as tasks to resolve;
- accumulate into a consultable **history** on the user's disk;
- become raw material for **knowledge graphs** and **documentation**;
- act as **specs anchored to code** — they cannot drift from the implementation because they live physically attached to the code point they describe.

The mental model is an **inverted GitHub code review**: the user is the reviewer (reads, annotates), the AI is the committer (implements the fixes).

This is not a write-first IDE with AI bolted on (Cursor), nor a PR-cycle review bot (Bugbot, CodeRabbit). The differentiator is the **read-first** inversion plus **persistent, overlay annotations** as a knowledge base and spec-driven-development engine.

Reado is a **personal tool first**. Open-sourcing happens *after* daily use validates what is essential.

## What Changes

This change introduces the Reado MVP: a Tauri 2 + React + Vite desktop app with a Rust backend, built around the read → annotate → AI-resolve loop.

Key product decisions (diverging from the original draft spec where noted):
- **Comments are an external overlay** ("Google Docs" model). The code file is never modified to host a comment. The UI renders comments next to lines.
- **Source of truth = per-comment `.md` files** under a local `.reado/` folder, **gitignored by default** (with an opt-in toggle to version them). A **SQLite index** is a rebuildable cache (gitignored), never authoritative.
- **No SDK, no tool-driven git orchestration.** The AI loop = a button that **injects a command into the integrated terminal** where `claude`/`codex` runs. The agent reads/updates tasks through a stable **`reado` CLI**, delivered as a **plugin** (Claude Code plugin + Codex equivalent).
- **Anchoring** survives external edits (including the agent's own file writes) via **git-diff remap first, fuzzy snippet match as fallback**; failures surface in an **orphans panel** rather than pointing silently at the wrong line. Tree-sitter (Rust) for AST anchoring; Lezer (CodeMirror) for syntax highlighting.
- **Multi-agent and cross-review**: multiple agent terminal tabs; an AI can comment on another AI's work; each AI message shows the originating agent's logo.
- The agent applies fixes directly to disk; "review before apply" is **post-hoc** (pre-run snapshot → diff + easy revert), not pre-apply gating.

Scope note: the user has chosen a **wide MVP** (knowledge graph, multi-AI cross-review, cross-platform incl. Windows, i18n, base documentation views all included). `tasks.md` therefore sequences the build into phases so a usable daily slice ships first, even though all capabilities remain in scope.

## Capabilities

### New Capabilities
- `project-workspace`: open any local folder, recent-projects screen, full session restore, per-project + global settings, one-window-per-project, status bar, i18n (IT+EN), empty states.
- `code-reading`: CodeMirror 6 read-first viewer — syntax highlighting (Lezer), large-file virtualization, focus mode, comfortable reading width, breadcrumb + soft landing highlight, line-wrap toggle, dedicated rendering for non-code files (markdown/images/JSON), optional manual editing.
- `navigation-search`: Cmd+P fuzzy file open, full-text repo search (ripgrep), command palette (Cmd+K), keyboard shortcuts.
- `annotations`: comment creation/editing/deletion, threaded conversations (you + AI), fixed types (Bug/Refactor/Performance/Question/Note), states (open/in-progress/done/discarded), task-vs-note flag, full markdown with cross-references, floating popover near the line, gutter markers with overlap counter, line/range/file/project scope.
- `annotation-anchoring`: overlay anchoring model, adaptive context snapshot, git-diff + fuzzy remap on external edits, in-editor live tracking, recompute on watcher event + on file open, orphans panel + manual re-anchor, rename/delete handling, tree-sitter AST anchoring.
- `annotation-store`: `.reado/` layout, per-comment `.md` schema (YAML front-matter + body), `archive/` for resolved comments, SQLite index (build on open + incremental), gitignore toggle with "don't ask again", first-comment init flow.
- `ai-review-loop`: launch agent into terminal, "Send review" injecting a batch (all open tasks, deselectable, plus "send just this now"), `reado` CLI contract (`task list/show/done/fail/link`, `comment add/reply/search`), plugin install + auto-update + context injection on agent launch, agent marks done via CLI, error → back to open with note, multi-agent selection, cross-review between AIs with per-agent identity.
- `integrated-terminal`: multi-tab real PTYs (portable-pty + xterm.js), login shell (zsh), interactive input, launch buttons for claude/codex.
- `diff-view`: on-demand only (default shows code), base picker (working tree / branch / commit with search), post-hoc snapshot + revert, configurable accept posture.
- `knowledge-graph`: nodes = comments + files, edges = manual links + co-location; views for work progress, concept exploration, and as a doc source.
- `documentation-views`: base documentation generated from comment history, filterable.
- `theming`: 2-4 themes from scientific color research, ≤6 semantic colors on a desaturated base, comfortable (not maximal) contrast, whole-UI theming, three selection modes (Manual / System / "Trust Reado" time-of-day auto-switch), live switch, colorblind validation + WCAG AA floor, configurable high-legibility code font.
- `notifications`: in-app badges + status indicator, OS notification on run completion, optional completion sound; history timeline of archived comments.

### Modified Capabilities
- None (greenfield project; no established specs yet).

## Impact

- New app: `codebase-reader/` (product name **Reado**) — Tauri 2, React 19, Vite 7, TypeScript; Rust backend.
- New companion plugin/CLI `reado` for Claude Code and Codex.
- New runtime dependencies: CodeMirror 6 (+ Lezer language packs), xterm.js, portable-pty (Rust), notify (Rust), tree-sitter (Rust), ripgrep, a SQLite driver, an i18n library, a graph rendering library.
- Local on-disk footprint per opened project: `.reado/` (gitignored by default).
- No telemetry; everything local.
