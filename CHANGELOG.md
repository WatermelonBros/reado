# Changelog

All notable changes to Reado are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under **[Unreleased]** as work lands; when a release is cut,
that section is renamed to the new version and its bullets ship in the release
commit.

## [Unreleased]

### Added
- **Stage a hunk, not a file.** A working tree usually holds one change worth
  committing and three that aren't, and "stage this file" can't express that.
  The diff now carries a strip of its hunks: stage, unstage or discard each on
  its own — the same thing `git add -p` does, without the interactive prompt.
  Where a hunk only adds lines, it can be broken down further and staged a line
  at a time; where it replaces lines it can't, because a `+` inside a
  replacement isn't a patch anyone means on its own. Discard asks first: it is
  the one action git cannot undo.
- **Merge conflicts are a question, not a marker-riddled file.** Opening a
  conflicted file from Source Control now shows each conflicted region as both
  sides side by side, labelled with the branch each came from, and takes one
  answer: keep ours, keep theirs, or keep both. Resolving rewrites that region
  and leaves the others alone, so five conflicts are five small decisions. Once
  none are left, one button stages the file. "Abort" abandons the whole merge or
  rebase — separate, destructive-styled, and it asks.
- **Semantic search answers as you type.** "Where do we…?" went to the terminal
  agent, which meant a round trip through an LLM for a question a full-text
  index can usually answer in milliseconds — and no answer at all when no agent
  was running. A local, rebuildable index over the project's symbols, paths and
  prose now answers from the first keystroke, ranked with BM25 and a boost for a
  hit on a declared symbol: a function *named* `parseConfig` beats a comment
  that mentions it. The agent is still there as the explicit escalation, for the
  questions that need the code read rather than matched — its answers are
  badged as its own and cached for the session. Results take arrow keys and
  Enter. The index keeps itself current as files change, and lives in `.reado/`
  where deleting it costs nothing.
- **A paired phone can watch the agent, and talk to it.** The Agent tab mirrors
  the desktop's agent terminal — its recent output, updated as it works — with a
  box to type back. The desktop keeps the only writer on that PTY; the phone
  sends keystrokes through it rather than opening a competing session. (The
  Shell tab is unchanged: that one is the phone's own terminal.)
- **Reado Anywhere finishes its review loop.** From the phone you can now
  approve or discard the AI pre-review's draft comments, resolve threads, and
  mark a file read — the same `.reado/` the desktop writes. And the desk pushes
  notices (the loop finished, the agent is waiting on you) to any paired phone,
  so walking away from the desk no longer means finding out later.
- **"Done" now comes with evidence.** A resolved task records who resolved it
  (agent and model), which diff did it, and what a verification command said —
  `reado task done <id> --capture --verify "pnpm test"`. A passing check marks
  the task done; anything else, including no check at all, leaves it
  **Resolved (unverified)**: an agent's claim and a proof are different facts,
  and collapsing them meant a reviewer couldn't tell which one they had. The
  comment thread shows the provenance, and the review-loop bar says how many
  resolutions nothing checked.
- **The MCP server can close the loop, not just read it.** Alongside the
  read-only resources it now exposes `task_done`, `task_fail`, `task_block`,
  `comment_add` and `comment_reply`, each returning the id and the resulting
  state rather than a bare success — so an agent can work through Reado's review
  loop without shelling out to the CLI.
- **A task can be blocked instead of failing forever.** An agent that hits a
  question it can't answer used to hand the task back as "open", which is
  indistinguishable from a task nobody has looked at — so the next loop sent it
  straight back into the same wall. `reado task block <id> "<reason>"` marks it
  blocked with the reason; three failed attempts block it automatically. Blocked
  tasks leave the resolvable set (they're out of `reado task list` and out of the
  review queue) and show the agent's question in the comment thread with an
  Answer box: your reply joins the thread, the task reopens, and the attempt
  count is forgiven. Relaunching an agent mid-loop re-dispatches only the tasks
  still outstanding, not the ones already done.
- **A large file asks before it opens.** A generated bundle or a huge fixture
  used to load straight into the editor and take it with them. A text file over
  the guard (2 MB by default, adjustable in Settings → Files, 0 to turn it off)
  now shows its size and an "Open anyway" button instead, and the file is read
  only if you ask — the guard is a speed bump, not a wall, and it remembers what
  you overruled.
- **Two git signals in the editor, off by default.** *Inline blame* annotates
  only the line the cursor is on with who last changed it and when — a whole
  column of names beside code you're reading is a lot of noise for a question
  you ask one line at a time. *Diff gutter* marks the lines that differ from the
  last commit. Both live under Settings → Files, and only appear inside a git
  repository.
- **Every tool panel can be docked.** Files, Search, Comments, Git, Problems and
  the rest lived only in the left sidebar, because the sidebar was the one thing
  that knew how to draw them. Their bodies are now shared, so any of them can be
  moved to the right or the bottom dock — tab-stacked beside the terminal, split
  next to the browser — from the menu on the panel's own title. A docked panel
  stops appearing in the sidebar (no second copy with its own scroll position),
  and its activity-bar icon brings the docked one forward instead.
- **A guided review can step back and take a wide pass.** The file-by-file walk
  is deliberately narrow, which is what keeps it honest — and also what makes it
  blind to the findings that only exist between files. "Wide pass" widens to the
  subsystem around the route and looks for the four things a single file can't
  show: the same mistake repeated across several files, drift from what the
  specs say the code should do, structural risk, and what the tests actually
  report when run. It is never automatic — it costs real agent time, and you
  decide when the narrow pass has earned it.
- **The review route knows what the project says about itself.** Planning ranked
  files on diff size, role and existing comments; it now also reads the
  `openspec/`/`.specify/` proposals and capability specs, the README and
  `docs/**`, and weighs a file up when it implements a documented capability —
  or contradicts one. Each route entry cites the document that moved it.

### Fixed
- **The Source Control badge notices a commit.** The watcher treated only
  `.git/HEAD` as a change worth re-reading, and a commit on the current branch
  doesn't rewrite HEAD — it moves the branch ref. So committing from the
  terminal left the rail badging the pre-commit count while the panel, which
  polls, showed the truth: 24 changed files beside an empty list. The watcher
  now also follows the branch refs, the index, the reflog and `packed-refs`
  (coalesced, so one commit is one refresh), and the panel's poll refreshes the
  count alongside the list so the two can't drift apart.

- **Where the terminal is docked has one answer.** The terminal store kept its
  own `position` alongside the layout model's, so dragging the panel to another
  dock updated one and not the other, and the panel could render its
  right-hand-dock layout while sitting at the bottom. The layout model is now
  the only source; an existing right-docked terminal is carried across.

- **A review loop that never started says so.** If the prompt never reached an
  agent — none installed, or the terminal gone — the loop sat at "Resolving…"
  forever, waiting on work nobody was doing. `dispatchToAgent` now reports
  whether it actually sent, and a loop that didn't start fails immediately with
  a line telling you to start an agent first.

### Changed
- **Reado Anywhere gives each phone its own credential.** Pairing used to hand
  every device the same session token: revoking one revoked all of them, nothing
  survived a restart, and a token never expired. Now the QR carries a
  **single-use pairing secret** — not a credential — that a phone spends once to
  mint its own, which persists across restarts and can be revoked on its own
  from a paired-devices list in the Anywhere dialog. Credentials expire after an
  idle stretch (30 days) or an absolute age (90 days), both adjustable, and
  failed authentication is rate-limited per address so nothing on the network can
  grind through the keyspace. The server also stops binding every interface: it
  listens on the machine's LAN address by default, or one you choose. Optional
  mDNS advertisement lets a paired phone find the desk again without a new QR
  (builds with `--features mdns`; the announcement carries the address only).
- **AI tasks have an honest state, and can be cancelled.** Synopsis, Q&A,
  semantic search, pre-review and AI tours each re-implemented the same
  hand-rolled poll loop, so a slow agent, a closed modal and a malformed result
  file all came out as the same generic error — with no way to cancel and no
  retry. They now run through one shared runner with states you can tell apart
  (running, done, failed, cancelled, timed out), a Cancel button beside every
  loading state, and failures that also reach the notice surface instead of
  failing in silence. A semantic search that matches nothing now says so
  instead of blaming the agent.

## [1.7.2] — 2026-09-02

### Added
- **Biome formats and lints the frontend.** One toolchain for formatting, lint
  and import order (`pnpm lint`, `pnpm lint:fix`), on a curated rule set: the
  rules that stay on are ones the code obeys, and the few that are off say why
  in `biome.jsonc`. The whole `src/` tree was brought in line — no semicolons,
  double quotes, 100 columns, imports organized.
- **Imports go through the `@/…` alias.** A module's location no longer leaks
  into every importer as `../../..`; siblings stay relative.
- **A PR can't merge on red.** Lint, typecheck, tests and the Rust suites are
  required checks on `main`, and lint runs as its own job.
- **Release notes come from the changelog.** The GitHub release page for a tag
  is built from that version's `CHANGELOG.md` section instead of a fixed
  sentence, so a release describes what actually shipped.

### Fixed
- **The terminal can't be dragged off the screen.** Resizing a dock had a floor
  but no ceiling, so pulling the terminal's edge to the top of the window pushed
  its own bottom — where the agent's prompt sits — out of view. A dock now stops
  with the editor still visible behind it, and a size saved from a bigger window
  is capped the same way.

## [1.7.1] — 2026-09-02

### Added
- **Source Control carries a badge.** Its icon in the tool rail shows how many
  files have working-tree or index changes, in accent blue — the count is
  information, so it doesn't borrow the red the open-comment and diagnostic
  badges use. It updates as files change on disk, not only on a commit.

## [1.7.0] — 2026-09-02

### Added
- **Files reach the terminal by dropping them.** Dragging files onto a terminal —
  from the file tree or from outside Reado — types their quoted paths at the
  cursor, which is how you hand a file to an agent running in the pane.
- **Links in terminal output are always coloured.** They used to underline on
  hover and look like ordinary text otherwise, so nothing suggested the output
  could be clicked at all. Every link in view now takes the accent colour.
- **Pasting an image in the terminal pastes a path.** A terminal carries text
  only, so an image on the clipboard is written to a temporary PNG and its path
  is typed instead, ready for an agent that reads image files.

### Fixed
- **Images show in the knowledge base.** A document rendered there resolved its
  own images against the webview's origin rather than the project, so a README's
  screenshots and diagrams came out as broken-image placeholders — the editor's
  preview already rewrote them, the knowledge base didn't.
- **Scheme-less addresses in terminal output are clickable.** A dev server
  (`localhost:3000`) or a bare domain has no `https://` for the URL matcher to
  latch onto, so the most-clicked link in the terminal wasn't a link at all — and
  a domain was misread as a filename. Both now open in the browser, and emails
  are left alone instead of being taken for a file.
- **Clicking a path in terminal output opens the file.** Agents and build tools
  print paths relative to wherever they ran (`Terminal.tsx:104`), not to the
  project root, so almost every click resolved to nothing at all. Paths are now
  matched by suffix across the project, shallowest match first, and a path that
  really isn't there says so instead of failing silently.
- **Reado Anywhere confines paths properly.** The LAN endpoint a paired phone
  talks to guarded its file and directory requests with a `..` scan of its own,
  which an absolute path walked straight past and a symlink out of the project
  ignored. It now uses the same guard as the desktop, which resolves the path
  and checks it really lands inside the project.
- **Windows paths shorten correctly in the UI.** A file whose path used
  backslashes was measured against a project root stored with forward slashes,
  so the breadcrumb, status bar and palette showed it whole instead of relative
  to the project — and a reading tour recorded that longer form to disk.

### Changed
- **Re-indexing comments is much faster.** The search index was rewritten one
  comment at a time, each write flushed to disk on its own, and it rebuilds
  every time a comment changes — so resolving a batch of comments spent most of
  its time waiting on the disk. The rebuild is now a single transaction.

## [1.6.2] — 2026-08-11

### Fixed
- **Cmd+S saves again.** Saving reported the file as read-only or the disk as
  full, while other editors wrote the same file happily. Neither was true: the
  editor reads a file by its absolute path but saves it by its project-relative
  one, and the backend resolved that relative path against whatever directory
  Reado was launched from instead of the project root — so the save missed the
  file entirely and failed with "no such file". Relative paths now always
  resolve against the project root, for every filesystem command, and paths that
  climb out of the root are still refused.

## [1.6.1] — 2026-08-06

### Fixed
- **Comments on the last lines of a file are reachable again.** A thread box
  hangs below the line it is anchored to, but the editor stopped scrolling at
  the last line — so a comment near the end of the file opened into space that
  could not be scrolled to, and looked like it had not opened at all. While a
  thread is open the editor now scrolls past the end of the code, far enough to
  clear the box.

## [1.6.0] — 2026-07-31

### Changed
- **The MCP server speaks both protocol eras.** MCP's `2026-07-28` revision
  removed the `initialize` handshake: requests now carry their protocol version
  in `_meta` and servers must answer a new `server/discover`. `reado mcp` serves
  both from the same process — today's agents keep opening with `initialize` and
  see byte-identical replies, while a client on the new revision gets stateless,
  typed results with cache hints (so it stops re-reading your annotations on
  every turn). A version we don't speak now comes back as a proper
  `UnsupportedProtocolVersionError` listing the ones we do.

### Fixed
- **Markdown previews show the document's own images.** A README's
  `![](docs/media/demo.gif)` — or any relative image path — rendered as its alt
  text instead of the picture. Local images now load from the open project
  (and only from it); absolute URLs such as badges are untouched.

## [1.5.0] — 2026-07-23

### Changed
- **Themes — research-grounded accessibility pass.** The default dark theme now
  reads at a comfortable perceptual (APCA) contrast — it was under-contrasted for
  fluent reading even though it passed WCAG. The six syntax roles are separated on
  lightness as well as hue, so they stay distinct in grayscale and for readers with
  colour-vision deficiency, and control-flow keywords are bold as a redundant,
  non-colour cue. Applied across all four themes (dark, light, high-contrast, sepia)
  and verified: every token clears WCAG AA and stays in the sRGB gamut.

### Fixed
- **Non-happy-path hardening** across the app, from a systematic audit:
  - Browser preview: a Rules-of-Hooks crash when reopening the panel, and races in
    the comment flow.
  - Editor & viewers: a stale flash when switching files quickly, a PDF-viewer
    memory leak on teardown, and a proper error state for images that fail to load.
  - Markdown viewer: inline image rows (e.g. README badges) render in a row instead
    of stacking one per line.
  - Settings are no longer overwritten when the config file can't be read; stores
    tolerate switching projects mid-load.
  - The LSP client, the `reado` CLI and the MCP server survive dead language servers
    and malformed input instead of hanging or crashing.
  - Terminal (PTY): writes no longer block the session registry; child processes are
    reaped on exit.
  - Filesystem & git: path-traversal and TOCTOU guards, file-size caps, and more
    robust `git status` parsing.
  - Annotation store: atomic writes, resistance to id collisions, and an advisory
    lock so two `reado` processes can't lose an update when editing the same comment
    or session concurrently.

## [1.4.0] — 2026-07-21

### Added
- **In-app PDF viewer** — open a `.pdf` to read it inside Reado, rendered with
  pdf.js (offline, no external viewer). Includes zoom controls (fit-to-width and
  magnify, crisp on HiDPI displays).
- **Reveal in Finder** — right-click a file or folder in the tree to reveal it in
  the OS file manager (Finder / Explorer / file manager).
- **LaTeX math in the Markdown preview** — inline `$…$` and block `$$…$$` math is
  rendered with KaTeX (fonts bundled locally).

## [1.3.0] — 2026-07-17

### Added
- **Browser design comments** — right-click anywhere in the browser preview to
  leave a comment pinned to that spot (page URL + position). Design comments live
  in the Comments panel; a red dot marks each on its page, and clicking it opens
  an in-place card to read, reply, re-type, edit, and resolve. A toolbar toggle
  shows or hides the dots.
- **Agent reasoning panel** — a live feed of the agent's decisions and
  assumptions, docked beside the terminal, written by the agent through the new
  `reado thought` command.

### Changed
- **Kotlin** — prefer JetBrains' official `kotlin-lsp` over the older
  `kotlin-language-server` when it's installed, for stronger go-to-definition.

### Fixed
- **Terminal** — Claude Code now launches with a theme matching Reado's, so it no
  longer renders white-on-white on the light interface theme.
- Toggled-on toolbar icons render duotone, matching the activity bar's accent.

## [1.2.1] — 2026-07-12

### Fixed
- The Linux build no longer pulls in PipeWire (via the `xcap` window-capture crate),
  which failed to build in CI and would have tied the binary to pipewire at runtime.
  The browser preview's frame-capture tool (`browser_frame`) is disabled on Linux as
  a result; every other browser tool (DOM, console, network, eval) works there.

## [1.2.0] — 2026-07-12

### Added
- **Dockable panels (magnetic layout).** The terminal and the browser preview can
  now sit **side-by-side or stacked** in the bottom or right dock, resized freely
  (drag the area edge or the splitter between panels) and rearranged by dragging a
  panel's dock tab (onto another panel to stack, onto its body to split — the drop
  target highlights as you go) or via the panel's **⋯ menu** (Dock right / Dock
  bottom / Stack). The arrangement persists and a **Reset layout** returns to the
  default. The default matches the previous layout, so nothing moves until you
  rearrange it.
- **Detachable console.** The browser's inspector (Console / Network / Elements /
  Application) can be **detached into its own dock panel** — put the console beside
  the terminal, or anywhere — and folded back into the browser when you're done.

### Fixed
- The "update available" badge is now vertically centred in the title bar instead
  of sitting low in it.

## [1.1.0] — 2026-07-12

### Added
- **In-app browser preview.** A dockable pane renders your running dev server
  right next to the editor, so you review a front-end without leaving Reado. It
  auto-detects the live dev-server port (reading `package.json`'s dev/start
  script and framework defaults, then common fallbacks) and reloads when a server
  you started *after* opening the pane comes up. Toolbar has back/forward/reload,
  an editable URL bar, detach-to-window, and close.
- **Device emulation & zoom.** Preset viewports (Mobile / Tablet / Laptop) or a
  custom W×H, plus a page-zoom control (10–300%, with **Fit**) so you can preview
  a 4K layout on a 1080p screen.
- **Built-in inspector.** Console, Network, Elements, and Application tabs docked
  at the bottom or the right of the pane (draggable to resize). Network rows open
  a Chrome-style detail view (request/response headers, payload, pretty-printed
  JSON); Elements renders the live DOM as real HTML with hover-to-highlight;
  Application edits cookies and local/session storage. Right-clicking the page
  offers Reload / Copy / Paste / Inspect.
- **Agent access to the preview (MCP).** With agent access on (the default), the
  `reado mcp` server exposes `browser_*` tools so the terminal agent sees and
  drives *the same* preview you do — read the console/network/errors, evaluate JS,
  inspect the DOM and animations, click/hover/type/scroll, navigate (confined to
  localhost and your allowlist), and capture a frame. Reado wires `reado mcp` into
  the installed agents' config on project open, so it's ready with no manual step.

### Fixed
- The MCP mirror files are cleared when the preview pane closes, so the agent's
  tools correctly report "no preview pane running" again instead of serving stale
  console/network data.

## [1.0.0] — 2026-07-11

The 1.0 milestone. This release reworks the launcher into a context-aware,
keyboard-first entry point — an onboarding on first run, a calm reading-desk
utility once you have recent projects.

### Added
- The launcher is now keyboard-first: **⌘/Ctrl+O** opens a folder from anywhere,
  and **↑/↓** move through the recent projects with **Enter** to open the
  highlighted one (the "open folder" actions show the shortcut).

### Changed
- The launcher now adapts to context. On first run it's an onboarding — wordmark,
  tagline, a prominent "open folder" action and the three-step teaching. Once you
  have recent projects it becomes a calm, left-aligned utility: the recent list
  leads, "open folder" drops to a quiet secondary action, and the tagline, hint
  and teaching (all redundant for a returning user) step aside. Recent paths are
  abbreviated with `~` for your home directory (the full path stays in the tooltip).
- The launcher wordmark gained an accent text-caret and a quiet tagline sub-mark,
  the content settles in with a subtle staggered entrance (honouring reduced
  motion), and each recent row now carries a chevron so it reads as openable.

### Fixed
- The remove (✕) button on a recent project is now vertically centred in its row
  instead of pinned to the top.

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

[Unreleased]: https://github.com/WatermelonBros/reado/compare/v1.7.2...HEAD
[1.7.2]: https://github.com/WatermelonBros/reado/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/WatermelonBros/reado/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/WatermelonBros/reado/compare/v1.6.2...v1.7.0
[1.6.2]: https://github.com/WatermelonBros/reado/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/WatermelonBros/reado/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/WatermelonBros/reado/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/WatermelonBros/reado/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/WatermelonBros/reado/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/WatermelonBros/reado/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/WatermelonBros/reado/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/WatermelonBros/reado/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/WatermelonBros/reado/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/WatermelonBros/reado/compare/v0.19.0...v1.0.0
[0.19.0]: https://github.com/WatermelonBros/reado/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/WatermelonBros/reado/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/WatermelonBros/reado/releases/tag/v0.17.0
