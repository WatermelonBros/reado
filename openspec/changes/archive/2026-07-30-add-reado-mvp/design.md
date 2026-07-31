## Context

Reado is a greenfield Tauri 2 desktop app (React 19 + Vite 7 + TypeScript frontend, Rust backend). It is a read-first code IDE whose core loop is: read code → leave anchored comments → an external AI agent (Claude Code / Codex), driven from the integrated terminal, resolves them. The scaffold already exists in `codebase-reader/`. This document records the load-bearing architectural decisions gathered in a 100+ question spec interview, and the risks that must be designed for from day one.

## Goals / Non-Goals

**Goals:**
- A calm, fast reading experience that the author opens *instead of* VS Code for understanding code.
- Comments as durable, overlay artifacts that never modify the underlying code and survive editing.
- A frictionless read → annotate → AI-resolve loop using the agent the user already runs in a terminal.
- A stable contract (`reado` CLI) between the app and any agent, so the on-disk schema can evolve independently.

**Non-Goals (this change):**
- Reimplementing an agent loop / tool-use engine (we reuse Claude Code / Codex as-is).
- Tool-driven git orchestration (branching, committing, staging). Git stays the user's, used read-only for diffs.
- An advertising layer (explicitly deferred; will live inside Reado later).
- Pre-apply patch gating (the agent writes directly; review is post-hoc).

## Decisions

### D1 — Comments are an external overlay (never touch the code)
The code buffer is never mutated to host annotations. The UI draws markers in the gutter and a floating popover near the anchored line. This is the "Google Docs comment" model and keeps the reading surface pristine and the source files clean.

### D2 — Hybrid store: `.md` is truth, SQLite is cache
Each comment is one `.md` file (YAML front-matter + markdown body) under `.reado/comments/`; resolved ones move to `.reado/archive/`. A SQLite index (`.reado/index.sqlite`, gitignored) exists only for fast queries and the graph and is fully rebuildable from the `.md` files. The `.md` also stores the last-known position and context snapshot so anchoring can be recomputed without the DB.

### D3 — `.reado/` is local and gitignored by default, with an opt-in versioning toggle
Personal-tool default: comments are not committed. The first comment in a project creates `.reado/` and offers to add it to `.gitignore` (with a "don't ask again" checkbox). A setting can flip to versioning for backup/sharing. Consequence accepted: with the default, comments are neither shared nor backed up via git.

### D4 — AI loop via terminal injection + `reado` CLI, not the SDK
"Launch agent" and "Send review" are two separate actions. Launch opens `claude`/`codex` in a terminal tab; Send review injects a prompt referencing the batch of open tasks. The agent reads and mutates tasks exclusively through the `reado` CLI (`task list/show/done/fail/link`, `comment add/reply/search`). The CLI is the stable contract; it ships as a Claude Code plugin (+ Codex equivalent), installed and kept up to date by Reado, with operating context injected on each agent launch. The agent marks tasks done via the CLI; Reado's watcher reflects the change in the UI.

### D5 — Anchoring: git-diff remap, fuzzy snippet fallback, orphans never silent
- In-tool edits track for free (CodeMirror moves decorations with the text).
- External edits (including the agent's own writes) trigger re-anchoring: **first** map old→new lines via `git diff`; **then**, if that fails or git is unavailable, locate the saved adaptive context snippet via fuzzy match; tree-sitter AST nodes assist structural anchoring where a grammar exists.
- Recompute on watcher events (notify, no polling, whole repo minus gitignored, debounced) and on file open.
- If re-anchoring fails, the comment becomes `orphan` (a flag, not a state) and appears in an orphans panel with its last-known context for manual re-anchor — it never points silently at the wrong line. File delete → orphan; file rename/move → path updated automatically from the watcher's rename event.

### D6 — Review is post-hoc, not pre-apply
The agent applies fixes directly to disk (its normal behavior). To support "see before keeping," Reado snapshots affected files before a run and offers a diff + easy revert afterward. The diff view is on-demand (default shows only code) with a base picker (working tree / branch / commit). Accept posture is configurable (auto / view-diff / —); true pre-apply gating is out of scope.

### D7 — Multi-agent and cross-review as first-class
Multiple PTY tabs can host different agents; Send review asks which agent receives the batch. An AI can create comments on code or on another AI's work (`comment add`/`reply`); every AI-authored message carries the originating agent's identity/logo (Claude Code / Codex / Copilot / …).

### D8 — Editor & rendering
CodeMirror 6 (chosen over Monaco for lighter weight and cleaner decoration/gutter APIs). Virtualization gives lag-free large files for free. Syntax via Lezer language packs (broad language coverage chosen over deep-but-narrow). Non-code files get dedicated rendering (formatted markdown, images, foldable JSON). Reading aids: focus mode (dim irrelevant code), comfortable reading width, breadcrumb + soft landing highlight, line-wrap off by default with a quick toggle. Editing is allowed but read-first is the design priority. Whole-UI theming, live theme switch.

### D9 — Cross-platform via Tauri, Windows last
macOS / Linux / Windows are all targets. Windows carries the highest cost (PTY, shell, path handling) and is validated last.

## Risks / Trade-offs

- **Anchoring is THE product risk.** Unlike GitHub (which anchors to immutable blobs at a fixed commit and just marks comments "outdated"), Reado must keep comments correct across continuous, external edits. The git-diff + fuzzy + orphans-panel strategy (D5) is the mitigation; it must be de-risked with a dedicated spike before significant UI is built.
- **Wide MVP vs daily-use validation.** The user opted to keep a broad MVP (graph, multi-AI, cross-platform, i18n, base docs). Risk: delayed validation of the core loop and effort spent on features that may not survive real use. Mitigation: `tasks.md` sequences a usable daily slice first (reading + comments + AI loop + terminal on macOS) before graph/docs/Windows/i18n.
- **Local-only, gitignored comments** (D3 default) are not backed up or shared. Accepted for a personal tool; the versioning toggle is the escape hatch.
- **Terminal-injection coupling.** The loop depends on the agent honoring injected prompts and the `reado` plugin being present. Mitigation: Reado guarantees plugin install + context injection on each launch (D4); agent failure returns the task to `open` with an error note rather than hanging.
- **Retention.** A reader alone won't hold the user (they'll bounce to their editor to make changes); the comment→fix→apply loop is the actual product and must be nailed first.
