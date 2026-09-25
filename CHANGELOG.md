# Changelog

All notable changes to Reado are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under **[Unreleased]** as work lands; when a release is cut,
that section is renamed to the new version and its bullets ship in the release
commit.

## [Unreleased]

## [1.25.0] — 2026-09-25

### Added

- **A Reado account, if you want one.** In the app you download from the Releases
  page, a new entry at the bottom of the activity bar, under Settings, lets you
  sign in with GitHub or with an email and password. Signing in happens in your
  browser, and Reado comes back to the front with your avatar when you're done. The
  account is optional: without one Reado works exactly as before. Your account,
  your plan and every place you're signed in live at
  reado.watermelon-studio.it/account.
- **Your settings follow you to every machine.** Sign in, turn on "Sync settings"
  in the account menu, and your theme, fonts, editor and interface preferences,
  shortcuts and disabled extensions stay the same on every computer you use. The
  first time, Reado asks whether to keep the account's settings or this
  computer's. Projects, paths and window layout never leave the machine.

### Fixed

- **A project whose `.gitignore` or build setup appears after you open it no
  longer floods Reado with build output.** The ignore rules were read once, when
  the project opened, so a `.gitignore` or `Cargo.toml` added later went unseen
  and every file a following `pnpm install`, `vite build` or `cargo build` wrote
  was treated as an edit — re-indexed, re-anchored and sent to the language
  server — until the app slowed to a crawl. The rules are now re-read as soon as
  such a file is created, changed or removed.

## [1.24.1] — 2026-09-24

### Fixed

- **On Windows and Linux the title bar fits a narrow window.** The search pill in
  the middle kept a minimum width, so below about 900px it spilled over the
  Discord button next to the menu bar and covered it. It now takes the space the
  row leaves and shortens the project name instead.

## [1.24.0] — 2026-09-23

### Added

- **A comment on a web page says which element it is about.** A code comment
  hands the agent `file:line`; a comment left in the browser preview handed it a
  URL and a pair of coordinates. It now records the element it was left on — a
  readable CSS selector, its visible text, the start of its HTML and, on a dev
  build of a React, Vue or Svelte app, the component that rendered it (with its
  source file when the framework keeps one). The agent reads it from the MCP
  resources and from `reado task show`; `reado task list` labels the task with
  the page and the element.

### Changed

- **The Git panel's ⋯ menu and its pickers work from the keyboard.** The menu is
  now a real menu: arrow keys move through it, Escape closes it and focus goes
  back to the button. Revert, cherry-pick, merge, rebase, worktrees, submodules,
  tags and remotes open in a centred dialog, and each picker reloads its list
  every time it opens.
- **The status bar's right-click menu lists items in the order they appear on the
  bar.** Terminal, column selection and profile were out of place.
- **The Coverage panel reopens instantly.** It shares the project's file list with
  the file tree, and a failed listing keeps the last list instead of showing
  none. Spec labels also drop an `.mdx` extension, not only `.md`.
- **Every palette entry is a command you can bind to a shortcut.** About thirty
  of them (onboarding, tours, tests, guided review, profiles, sync, …) ran their
  own code outside the command table, so they could not be bound and showed no
  shortcut chip; they are now ordinary commands.
- **`reado review context --json` includes the session's objective,** as the MCP
  tool already did. An empty `READO_AGENT` now counts as unset in the CLI too,
  and `--model ""` falls back to `READO_MODEL`.

### Fixed

- **Menus and popovers open above notifications and panels.** Their stacking
  order was set on Ark's positioner, which zag overwrites with the z-index of the
  panel *inside* it — so every one of them sat at `auto`, and the "language
  server isn't installed" notice covered the status bar's go-to-line and indent
  popovers. The order now lives on the panel, where zag reads it.
- **A menu taller than the window scrolls instead of running off it.** In a
  small window the file tree's right-click menu was pushed up until its first
  rows ("Comment on file", "Ask AI for an audit", …) were off-screen and out of
  reach, and the layout menu ran past the bottom. Every menu, popover and select
  is now capped at the room it has, and the right-click menu never starts past
  the top or left edge.
- **One tooltip at a time on a tab's close button.** Hovering it showed the
  tab's path and "Close" stacked on top of each other; a control with a tooltip
  of its own now speaks for itself.
- **The status bar gives way instead of overlapping.** In a narrow window or at a
  large interface zoom its items were squeezed under their own text until they
  covered each other — and the cursor position could no longer be clicked. The
  path shrinks first, the cursor position never does, and items that don't fit
  leave whole rather than half-cut.
- **Nothing is cut off in a small window or at a large zoom.** Checking every
  screen at three window sizes and three interface zooms found controls sliced
  at a panel's edge: the Output panel's Follow button and filter, the Tours and
  AI pre-review headers, the bottom panel's last tab. Toolbars now wrap onto a
  second row, a long label shortens with an ellipsis, and the panel's tabs
  scroll. The sidebar no longer collapses to a 40px sliver when the window is too
  small for it and the editor both (800×600 at 200%): the two share the room.
- **Comment boxes stay inside the editor.** A thread opened on one of the last
  visible lines hung past the editor, under the panel below; the code now scrolls
  up until the box fits, keeping it attached to its line. The new-comment box was
  placed on a guess at its height, and in a short editor (a small window, a large
  zoom, Italian labels) ran off the bottom; it measures itself now, and scrolls
  when the editor is shorter than it.
- **A comment's pin stays on what it was left on.** Pins in the browser preview
  were placed at the document point of the click, so on a page that scrolls in a
  pane of its own (most apps) the content slid out from under them, and a resize
  that reflowed the page left them pointing at something else. A new comment now
  remembers the element it was left on and the pin follows that element through
  scrolling, resizing and reflows; the comment card follows it too. Comments made
  before keep their old position.
- **Comments in the browser preview open inside the page.** The comment box, the
  comment card and the right-click menu opened wherever the click was, and near
  the right or bottom edge hung out of the visible page; they are pulled back in.
- **An agent started in a phone terminal can reach `reado`.** The Reado
  Anywhere terminal built its shell without the `PATH` and `COLORTERM` the desktop
  terminal sets, so the bundled `reado` was missing there and the agent's MCP
  server never started. Both terminals now open their shell the same way.
- **A drag that gets interrupted ends.** When the OS or the webview took the
  pointer mid-drag, or the window lost focus, resizing the sidebar, dock,
  terminal or preview kept following the mouse, and a tab or file-tree drag left
  its ghost stuck to the cursor.
- **Blame and change marks follow the right folder in a workspace.** Switching
  folder without switching file left the gutters showing the previous folder's
  git data.
- **`comment_add` over MCP creates a task by default,** like `reado comment add`.
  It used to create a note, so the same request made a task over one channel and
  a note over the other. Pass `kind: "note"` for a note.
- **Accepting the same proposal twice at once makes one comment.** Two accepts at
  the same time, from the desktop and the CLI, could each create a comment and
  orphan one of them. Answering a blocked task now adds the reply and reopens the
  task in one write.
- **The agent's hand-back and mascot lines are never read half-written.**
  `done.json`, `mascot.json` and the preview command file are now written in one
  step. On Linux the file watcher also picks up these atomic writes; it skipped
  them before, so saves made that way went unnoticed.
- **The phone's list of changed files matches the desktop's.** Reado Anywhere
  read `git status` on its own: paths with spaces or accents came back quoted,
  Reado's own `.reado` files showed up as changes, and the read could collide
  with a git command running in the terminal (`index.lock`).

## [1.23.2] — 2026-09-22

### Fixed

- **"Send to the agent" sends the prompt when an agent is already running.** It
  decided which of the two commands to send — the prompt, or the one that
  launches an agent — from Reado's own record of what *it* had launched. An agent
  the user started themselves wasn't in that record, so the launch command was
  typed into the running agent, which read it as a prompt. Reado now asks the
  pane's tty what is actually running there, which also covers the mirror case
  (an agent Reado launched and the user has since quit, where the prompt would
  have been *executed* by the bare shell), and hands the prompt to the pane
  running an agent rather than to whichever pane happens to be focused.
- **The mascot's speech bubble holds its text.** Two ways it didn't: the clamp
  that limits the bubble to three lines sat on the same element as the padding
  reserving the tail's room, and `overflow: hidden` cuts at the padding edge — so
  the line meant to be hidden was drawn across the tail, below the outline. And a
  long unbroken token (a file path, a URL — most of what an agent says) had
  nowhere to wrap and ran straight out through the side. The text is clipped on
  its own element now, and wraps mid-token when it must.
- **Everything that floats opens in front of the browser pane.** Menus, popovers,
  selects, tooltips, dialogs, the right-click menu on the URL bar — the pane is a
  native child window that paints above all of Reado's own DOM, and only dialogs
  told it to step aside, so everything else opened underneath the page. Nothing
  registers any more: Reado reads the floating layers off the DOM (they are
  portals on `<body>`, or `position: fixed`, and there is no third way to float),
  so a layer added later cannot forget to. The pane steps aside only while a
  layer actually lands *on* it — a tooltip over the sidebar leaves it alone.
- **"Allow or deny" is asked once per site, and it sticks.** The agent-access
  gate that guards a page holding a credential keyed its grant on the exact URL
  and kept it only in memory — so a single sign-in re-asked at every step (email
  → password → 2FA), and every restart asked again from scratch. The grant is now
  per origin, lasts two days, and survives a restart; switching the agent's access
  off revokes every one of them at once.
- **One 1Password approval per fill, not one per login.** Listing a site's logins
  read every match with its own `op item get` — and `op` asks the 1Password app to
  authorize *each* invocation, so a page with a few saved logins produced a wall
  of Allow/Deny prompts, again at every step of a sign-in. The list `op` already
  prints carries the account name, so the lookup is one invocation, its result is
  reused for a few minutes across pages, and the item itself is read once — at the
  fill, which needed to read it anyway.

## [1.23.1] — 2026-09-21

### Fixed

- **The title bar's search pill advertises a key that works.** It printed `⌘K`,
  which had since become a chord prefix — pressing it armed the prefix and the
  pill did nothing, leaving "⌘K is waiting for a command" in the status bar. It
  now asks the binding table what opens the palette (`⇧⌘P`, or whatever you have
  rebound it to) instead of spelling it out.
- **A language server is never asked to shake hands twice.** Servers live in the
  Rust backend and outlive a webview reload, and the connection key was only
  `server:root` — so after a reload (or in a second window on the same project)
  a fresh client was handed the *running* process and its `initialize` was
  refused, each server in its own words: clangd `server already initialized`,
  gopls `initialize called while server in initialized state`, rust-analyzer
  `unknown request`. That client then had no code intelligence for the rest of
  the session and nothing said so. The key now carries the webview session, so
  every client owns the process it initializes.
- **JSON files report their syntax errors.** `vscode-json-languageserver` keeps
  validation behind `json.validate.enable` and treats "never mentioned" as off,
  and answering its `workspace/configuration` request was not enough — a file as
  plainly broken as `{ "a": }` came back with a report of zero problems. The
  settings are now pushed after the handshake, the same way the TypeScript code
  lens settings already were.
- **File drops no longer leave an unhandled rejection behind.** Tauri's
  `onDragDropEvent` returns a synchronous composite that calls four async
  unlistens and ignores every promise they return, so tearing down a pane threw
  a `listeners[eventId]` rejection that no caller could catch — it came from
  inside the library, with no application frame in its stack. Reado subscribes
  to the drop event it actually wants and keeps an unlisten it can guard.
- **Three subscriptions that could outlive what they were watching.** A terminal
  pane, a task run and a test run each registered their PTY listeners *after* an
  `await`, with the "are we still alive?" check before it — so anything that
  tore down inside that window left a live subscription to a process that had
  just been killed. Each now checks again on the other side of the await.
- **Closing the terminal panel no longer kills the shell.** A `<Terminal>` kills
  its PTY when it unmounts, and the dock already guarded the two ways that could
  happen — a collapsed region, an inactive tab — but not the third: the panel's
  own open flag. Pressing `⌘J` (or the status-bar button) and opening it again
  gave back the same session id and the same title with a *different* shell
  process, the exported environment gone and anything that had been running gone
  with it. A terminal now stays mounted and hidden.
- **Postponing an update no longer costs you the title-bar controls.** The
  "update available" pill placed itself at `fixed top-0 right-3`, which is
  exactly where the trailing controls live — Discord and the sidebar, panel,
  secondary-sidebar and layout toggles were covered, and stayed covered until you
  took the update. The pill is now laid out by the title bar, so they move aside.
- **A comment thread stays readable with the terminal open.** The popover gives
  its fixed chrome — header, type row, reply box — the space it needs and lets
  the conversation have the rest, which in a short editor pane meant 24 pixels of
  message list around 145 pixels of message: the reply was on screen and
  unreadable. The conversation now keeps a floor and the box scrolls instead.
- **Tooltips near the right edge are readable again.** The global tooltip is
  centred with a transform but was sized by the browser against the space left
  between its `left` and the window edge — so the further right the button, the
  narrower the bubble: the status bar's own indicators were getting 89 pixels and
  wrapping a one-line label onto four. It now sizes itself by its text.
- **Reado's own files no longer count as your changes.** `.reado/` (local
  history, index, bookmarks, reading progress) and the `.mcp.json` Reado writes
  to register its MCP server were reaching every git-derived view: Source Control
  showed 110 changes for a project with four, the activity-bar badge agreed with
  it, and a guided review on "the current changes" planned a reading route over
  56 of Reado's own history snapshots. The `.gitignore` entry was meant to cover
  this, but it is only offered when you create your first comment — and
  `.reado/.history/` starts filling on your first save. It is now filtered at the
  source, whatever the `.gitignore` says.
- **CSS and SCSS files show their problems again.** Reado answered
  `workspace/configuration` with `null` per section, which the TypeScript server
  ignores and the `vscode-langservers-extracted` family does not: css/scss/less
  dereferenced the null on every validation (`Cannot read properties of null
  (reading 'validProperties')`) and produced nothing at all. Reado now answers
  `{}`, as VS Code does — measured on the same broken stylesheet, zero
  diagnostics became two.
- **A server that says "my diagnostics changed, ask me again" is now heard.**
  `workspace/diagnostic/refresh` went unanswered, so the library replied
  `-32601 Method not implemented` on Reado's behalf and nothing re-asked: a
  pull-mode server answers the first request before it has finished validating,
  and that empty first answer was the only one the file ever got. The code-lens
  twin of this handler was already there; the diagnostics one was missing.
- **Servers are no longer asked to resolve what they never offered.** Code lenses
  and completion items were sent `…/resolve` without checking the matching
  `resolveProvider` capability — up to 200 round trips per document, each
  answered with "Method not implemented" on the server's own stderr.
- **A server request Reado doesn't answer now says so, with its name.** It used
  to fall through to a blanket `-32601`, which is how a family of "Unhandled
  exception" lines reached the log with nothing identifying the cause.
- **A word that isn't one of the shipped ones can no longer take the window down
  either.** The settings parser compared types, so `"colorVision": "protanopia"`
  was a string like any other: accepted, stored, and then looked up in a palette
  table that has no such mode — reading a token off `undefined` reached the root
  error boundary, and the value survived a restart because it had been
  persisted. Every setting whose value is one of a fixed set now declares that
  set next to its default; a value outside it is reported and skipped, and one
  already stored is healed on the next start.
- **A number out of range in the settings JSON can no longer take the window
  down.** `"terminalScrollback": -5` was accepted (it is, after all, a number),
  stored, and then thrown by xterm inside the terminal's render — which reached
  the root error boundary and blanked the whole app, not just the pane. Every
  numeric setting now carries its range next to its default, so the JSON dialog,
  an imported sync bundle and a project's `config.json` are held to the same
  limits the controls in Settings have always shown. A value already stored out
  of range is clamped on the next start.
- **The agent indicator in the status bar tells the truth.** It was the constant
  "Agent idle" — it had never once said anything else, and would announce an idle
  agent while the companion, reading the same facts, showed it thinking. It now
  reads those facts.
- **"Open View ▸ …" opens.** The six entries (and `⌘⇧E`, `⌘⇧G`, `⌘⇧C`) routed
  through the activity bar's *toggle*, so using one while that view was already
  showing collapsed the sidebar — including the VS Code shortcuts, which there do
  the opposite. Toggling stays where it was asked for: the activity-bar button
  and `⌘B`.
- **⌘F inside the editor no longer claims to search the project.** The field said
  "Search in project…" — the sidebar's wording — while searching only the open
  document, so a symbol that was elsewhere in the project read as missing.
- **The knowledge graph counts its nodes.** The summary line printed
  `{{nodes}} nodes · {{links}} links` literally, in all five languages: the one
  string in the catalogue written with i18next's double braces, which Reado is
  not configured for. A test now rejects that syntax outright.
- **A split editor pane is no longer a button.** Each unfocused pane was wrapped
  in a `<button>` that contained the pane's own tabs, close buttons and ruler
  markers — 22 nested buttons, invalid HTML, and a tab order and screen-reader
  tree that both came out wrong. Clicking a pane still focuses it.
- **Far fewer unhandled rejections when a terminal, a task or a test run ends.**
  Tauri's `unlisten` rejects once its listener map is gone, which is the normal
  case when the thing being unsubscribed from is a PTY that just died. Two call
  sites guarded it and seven did not; all nine now go through one `offSafe`
  helper that takes either an unlisten or a promise of one. A rarer
  double-unsubscribe still slips through under a fast burst of terminal
  commands — the message says `listeners[eventId]` is already gone — and is not
  yet tracked down.
- **Code lenses stop asking servers to resolve what they never offered.** A
  server that advertises code lenses without `resolveProvider` was asked anyway,
  once per lens (up to 200 per document), and answered "Method not implemented"
  on its own stderr — which no amount of catching on our side could keep out of
  the log.

## [1.23.0] — 2026-09-19

### Added

- **The companion can be parked on a display of your choosing**, not only in a
  corner of the one Reado is on. *Settings ▸ System ▸ Notifications* lists the
  screens the OS reports; the default still follows Reado's own window, and the
  picker stays out of the way on a single-screen machine.
- **A mascot button in the status bar** turns the companion on and off. Sending
  it away with a right-click used to mean a trip through Settings to get it back.
- **A project's `.vscode/extensions.json` is read** for recommended extensions,
  alongside `.reado/extensions.json` — Reado's own wins where a repository keeps
  both. A project that already lists what it needs for VS Code no longer has to
  keep a second copy, the same call Reado already makes for `.vscode/tasks.json`.

### Fixed

- **Reado Anywhere confined a phone to the project again.** The LAN file and
  directory routes rejected `..` but not an absolute path — `join` discards the
  root, so `/etc/passwd` was read straight through — nor a symlink pointing out
  of the project. They now canonicalize and compare against the root, the check
  the local filesystem commands were already using.
- **The editor no longer decides your file is indented by one space.** The
  indentation guess read the *smallest* indent in the file, and a block comment's
  ` * continues here` is a line indented by one — so any file carrying one came
  out at a single space (271 of this repository's own 512 source files did). It
  now reads the step between indent levels, ignoring comment alignment. A
  project's `.editorconfig` still outranks the guess wherever one applies.
- **The companion stops claiming the agent is working when it isn't.** "Working"
  was entered on any sign of activity and left only by a handoff, so an agent
  that finished without sending one left the owl thinking for the rest of the
  day. It now goes back to idle when the signs of work stop arriving — and once
  an agent has handed the turn back, its pane repainting no longer counts as work
  at all, until Reado dispatches again or you type into that pane yourself.
- **The companion finds its corner again when you plug in a screen.** Nothing
  reports a display change, so a window parked against the laptop's work area
  stayed where it was and ended up stranded mid-screen. It now notices the work
  area has moved under it and re-parks itself.
- **A tucked companion lets clicks through.** Sent to the edge, its way-out
  button — a character's width inside the screen — stayed marked as solid, so the
  transparent window kept swallowing clicks meant for whatever was behind it.
- **Recommendations Reado already satisfies stop being offered.** A project
  recommending `rust-lang.rust-analyzer` means "install rust-analyzer", which is
  what Reado's curated Rust entry installs — but the check only looked at Open
  VSX, so the notice came back on every project open with nothing to do about it.
  Twenty-five well-known ids are now recognised as the curated tool they name.
- **Switching projects no longer leaves the old project's watcher running.** Each
  project opened in a window started a filesystem watcher and never stopped one,
  so the retired watcher kept reporting *its* files as changes for the newly
  opened project — on top of leaking a thread and a recursive watch per switch.
- **Failed writes of the resolve-loop state and of an agent's MCP config are
  reported** instead of being discarded silently.
- **The diff gutter now follows your edits.** Its change marks were computed once
  when the file opened and never again, so every mark went stale the moment you
  saved — the refresh it documented was keyed on a value that did not exist.

### Changed

- **The window stops locking up on whole-project work.** Listing files, indexing,
  the symbol palette and search each walked the project on the UI thread; they
  now run on a worker, as the git commands already did.
- **Scrolling a file is smoother.** The editor coalesced nothing, re-rendering on
  every scroll event rather than once per frame, and the file tree rescanned the
  whole project for every folder row it drew.
- **Fewer round trips to the backend.** Marking a file read re-read it from disk
  while its text was already on screen, and saving a file fetched the whole body
  of every open tab only to check it still existed.

## [1.22.0] — 2026-09-16

### Added

- **A mascot that shows what the agent is doing.** A small owl in a corner of the
  screen — its own always-on-top window, click-through everywhere except the
  character and its bubble, never taking focus. It thinks while an agent works,
  settles when the turn is handed back, and puts on the face of someone about to
  ask a question when the agent is blocked. Off by default; *Settings → System →
  Notifications* turns it on and picks its corner and size. A tab on its side
  sends it off the edge of the screen, leaving a thin bar that brings it back;
  right-click sends it away for good.
- **`mascot_say`, for the agent.** One MCP verb, one line of plain text, an
  optional mood. It is the only way words reach the bubble — which is what keeps
  the bubble honest: the companion never writes its own advice, and never speaks
  on a timer. Bounded and refused rather than truncated, so an agent knows when
  its message did not arrive whole.

### Fixed

- **One alert per handoff, not one per command.** Agents call `session_done` far
  more often than they finish — once for every command that returns — so the
  "agent is back" notification fired all through a task. The instruction now says
  the moment plainly (call it when your next act is to *wait for the user*), and
  Reado coalesces a run of handoffs into a single alert carrying the last summary,
  for the agents that say it anyway.
- **A closed file no longer saves its caret afterwards.** The per-file caret
  position is written on a 300ms debounce, and closing the file inside it let the
  write land anyway — reading the project root at *that* moment, so closing a file
  and switching project within the debounce filed its caret under the new root.
- **The bundled `reado` CLI is reachable even when `~/.local/bin` isn't on your
  PATH.** The app installs the CLI there and used to assume the shell's profile
  added it; where it doesn't, `reado` was installed and unreachable — so the MCP
  server an agent is told to call (`session_done` and the rest) never started. The
  install directory is now prepended to the PATH of everything the app spawns, the
  integrated terminal included.

### Changed

- **The Terminal tab is always there.** Closing the terminal no longer removes its
  tab from the bottom dock — the tab stays on the strip, and clicking it starts a
  shell in the project folder when none is running. Closing it hands the
  selection to a sibling tab, so a selected tab is never a tab with nothing
  behind it.

## [1.21.0] — 2026-09-16

### Added

- **Guided review: the session as MCP tools.** `session_show`, `review_context`,
  `review_plan`, `review_propose_route_change`, `review_propose_comment`,
  `review_propose`, `review_summarize_file` and `session_summarize` are now MCP
  tools with typed arguments, and the server's instructions carry the
  guided-review contract — so every MCP-speaking agent gets it, not just the one
  whose CLI takes a system-prompt flag. The `reado` CLI keeps the same verbs, and
  now reads a route from stdin (`--route -`) or a file (`--route @path`), so an
  apostrophe in a `reason` can no longer eat a plan.
- **Route coverage.** A session started from the diff or a branch records the
  files git reports for that scope — untracked ones included. Setting a route
  answers with the ones it left out, and the panel shows the same gap next to the
  progress (where "done" would otherwise be a lie), each file openable, with a
  one-click ask to route them. A file may still be left out by marking it out of
  scope; silence no longer passes for an answer.
- **Route changes are proposed, not applied.** The agent proposes a new route
  with a reason; the panel shows what it adds and what it drops, says in its own
  words what a route change is and that nothing moves until you choose, and the
  route under review does not move until you accept. Re-planning a session that already
  has a route is refused and pointed at the proposal instead.

### Changed

- **The Review Guide says what it is doing.** A guided-review action hands a
  prompt to the terminal agent, and the panel used to go silent: it now shows
  sending, then waiting, against the action that started it, and stops waiting
  when the session changes. A prompt that could not be delivered — no agent
  running — says so instead of looking sent, and every session write that fails
  reports what failed and why rather than being swallowed.
- **A second press on the paths that cannot be undone**: deleting a review,
  discarding every proposal on a file at once, abandoning an edit you typed, and
  accepting a route change that drops files you already have findings on (which
  now names those findings; a change that only adds files still takes one press).
- **The panel reads as a panel again.** One card — the decision waiting on you —
  and flat sections for everything else, with real space above each heading; the
  current file's name is now the largest thing on screen; the occasional actions
  (respond, wide pass, note/edit/false-positive) moved into overflow menus so the
  two that advance the review stand out; every file path is written the same way.
  The action cluster is one row at one height (a 36px primary over 32px chips
  that share the width, and a 32px overflow square) instead of four controls at
  four sizes, everything sits 16px off the panel's edges instead of 12, and no
  control rests against a divider.
- **The progress bar stopped lying and became visible.** Its track was drawn in
  the same colour as the surface behind it, so at 0% it painted nothing. The plan
  and the part of the change that was never planned are now two bars, not one
  stacked one — the second hatched, because it is not progress — with
  `role="progressbar"` and the numbers in its tooltip.
- The session title, and the scope description in it, are in the user's language
  (a review started from the Italian UI was titled "Review the current diff").
- **The route is a reading order now, not a triage queue.** It was ranked by
  risk, which is how you find a bug fast and how you drop a reviewer into the
  middle of a change with no context. The planning pass is asked to start where
  the change starts, carry on in the order that makes each next file make sense
  (definition before use, the changed function before its callers), keep files
  that must be read together adjacent, and leave generated output and lockfiles
  for last — with risk ordering files inside that reading rather than replacing
  it. Each reason now has to say what the reader knows by the time they arrive.
- **Not every file needs reading.** `suggestedReviewMode` existed with nothing to
  choose it by: the prompt now defines deep, normal and quick, and says outright
  that a mechanical change can be `quick` or out of scope — covering a scope means
  every file is accounted for, not that every file is read closely.
- The planning prompt now carries the review objective (choosing "security" used
  to rank the route by generic risk) and the file set Reado already read from
  git, instead of asking the agent to rediscover it with a `git diff` that does
  not list untracked files.
- The per-file prompt tells the agent how to route a file it discovers matters
  mid-review, instead of leaving it to review off-route or say nothing.

- **Turning on commit signing says right away when the repository cannot sign.**
  The switch wrote `commit.gpgsign` / `tag.gpgsign` and nothing else happened —
  until the next commit, which git refused with gpg's own error. It now checks
  what is actually missing (no gpg, no configured key, SSH signing without a key)
  and names the config line that fixes it. The setting still applies: the answer
  is advice, not a veto. Only the certain cases warn — a false alarm on a working
  setup would teach you to ignore the real one.
- The commit graph has a command id (`git:graph`), so it can be bound to a key
  like any other command. Its ways in are unchanged: the Git panel's menu and the
  command palette.

- **The Test Explorer says what its buttons do.** Running a test is a play
  button, not the two arrows that read as "refresh"; while a run is in flight the
  header's play becomes a Stop that ends it, and a test the run never judged goes
  back to having no verdict instead of spinning forever.
- **The test list is windowed.** Only the rows near the scroll position are in
  the DOM, so a project with tens of thousands of tests draws as fast as one with
  ten. A row's run button is drawn for the row under the pointer only — measured
  in the real app, three hundred of them cost ~90ms a scroll, which is five
  frames of blank list.
- **The Test Explorer counts what it found and what it knows.** A strip above the
  tree says how many tests there are, how many passed and how many failed.
- **Tests run out of sight.** Running a test no longer opens a terminal pane and
  types a command into it: the run happens in a PTY the user never sees, and the
  answer arrives where it was asked for — ticks and crosses in the Test Explorer.
  What a failing run printed goes to the log.

### Fixed

- The wide-pass prompt contained newlines while the pane types prompts and then
  presses Enter — it could submit as several fragments. All guided prompts are
  single-line again, and a test holds them there.
- **Tests declared in a loop get their verdict.** A test written
  `` it(`${id} runs its action`) `` is printed by the framework with the name
  expanded, so it never matched what Reado read out of the source — nine of
  Reado's own ran, passed, and sat in the tree marked "not run" for good. What
  was written is now read as the pattern it is, and a failure among the names one
  declaration produces is what the row shows.
- **The Test Explorer counts tests, not lines of source.** One `it()` in a loop
  is one row and many tests — Reado's own API test is two hundred of them — so
  the panel's total always read lower than the framework's. A row now counts for
  as many tests as the last run reported it under, and says so (`×200`).
- **The Test Explorer's numbers add up.** The strip counted passes and failures
  and left the remainder unexplained — "3312 tests, 3301 passed, 0 failed" with
  no word about the other eleven. It now names them: skipped, and never judged.
- **Rust fixtures are no longer read as tests.** A `#[test]` inside a `r#"…"#`
  string — how a parser's own tests are written — was discovered as a test that
  no `cargo test` could ever run, so it sat in the tree forever unjudged.
- **A run cut short no longer spins forever.** Closing the window mid-run left
  every test it had started marked "running" — permanently, since the verdicts
  are remembered per project. They are dropped on load, and a run that ends
  without judging a test gives it back no verdict rather than a spinner.
- **The browser pane stops knocking on every port.** While its page was not
  answering, the pane probed a dozen candidate dev-server ports every two seconds
  for as long as it was open — thousands of connections an hour, and on macOS a
  permission prompt that kept coming back. It now backs off to half a minute
  while it finds nothing and returns to two seconds as soon as it does.

- **Tests run from their own project, whatever the language.** The Test Explorer
  ran every framework from the Reado root, which fails the moment the code is not
  there: `cargo test` outside a crate (`could not find Cargo.toml`), `npx vitest`
  outside the package that installed it, `go test` outside the module, `pytest`
  outside the package. Discovery now records the nearest manifest above each test
  file, and a run `cd`s into it — one command per project, so a repo with several
  crates or packages runs them all.

## [1.20.0] — 2026-09-14

### Added

- **Tasks a project already describes, without writing them down.** Reado now
  reads the manifests: every `package.json` script (run with the manager the
  lockfile names — pnpm, yarn, bun or npm), `cargo build/test/check/clippy/run`,
  `go build/test/vet`, and `tsc` build and watch. They appear in Run Task marked
  with where they came from, and a `tasks.json` entry with the same label
  overrides one instead of duplicating it.
- **`tasks.json` entries with a `type` resolve through their provider.** A
  `{ "type": "npm", "script": "build" }` has no command written down — the npm
  provider is what knows a script is run with `run`. `npm`, `cargo`,
  `typescript`, `gulp`/`grunt`/`jake`, and `shell`/`process` are understood,
  along with `options.cwd`, `options.env`, and the `${…}` variables these files
  are full of (`${workspaceFolder}`, `${file}`, `${relativeFile}`, `${env:VAR}`,
  and the rest), resolved when the task runs.
- **Problem matchers by name.** `"problemMatcher": "$tsc"` now gets tsc's parse
  instead of a guess — `$tsc`, `$tsc-watch`, `$msCompile`, `$gcc`, `$go`,
  `$python`, `$eslint-compact`, `$eslint-stylish`, `$jshint`, `$rustc` and
  `$cargo`. An empty list means "this output is not diagnostics" and is
  respected; no matcher at all still tries everything, as before. eslint's
  stylish format (the file on its own line) is read too.
- **Problems is a tab in the bottom panel**, beside Terminal and Output, where
  VS Code puts it. It leaves the activity bar — the count rides on the tab
  instead, and counts what the panel lists: the servers' diagnostics *and* what
  a task's problem matcher found. Switching tabs closes nothing: the terminal
  keeps its shell and whatever is running in it. "Problems" in the View menu and
  the command palette brings the tab back if it was closed.
- **The default build task.** `"group": { "kind": "build", "isDefault": true }`
  is what Run Build Task runs when a project has several build tasks.

### Changed

- **One place to find and replace across the project.** ⌘⇧F opened a search-only
  overlay, so replacing meant closing it and reopening the Search panel from the
  sidebar to type the query a second time. It now opens that panel directly —
  seeded with the selection, caret in the field — and the redundant overlay is
  gone. Find in Files, Replace in Files and the palette's Search command all land
  in the same place.

### Fixed

- **The browser pane loads a dev server reached by name again** — an
  `/etc/hosts` alias, a `.test`/`.local` host, anything that isn't loopback or a
  bare IP. macOS ignores the blanket `NSAllowsArbitraryLoads` whenever a granular
  App Transport Security key sits beside it, so the pair Reado shipped left only
  loopback allowed: every http *hostname* was refused before a request was made,
  and the pane just sat on the previous page with no error. It now declares the
  key that applies to web views.

- **A bare hostname in the address bar goes there instead of to a search.**
  `myapp` and `myapp:3000` — what an `/etc/hosts` alias looks like — were treated
  as search terms, because nothing in the webview can read `/etc/hosts`. Reado
  now asks the machine's own resolver (briefly, and only for that one ambiguous
  shape), so an alias navigates and `time:30` still searches.

- **Rust projects no longer flicker their problems once a second.** Reado's
  watcher reported rust-analyzer's own build output back to it (`target/`, which
  only a `.gitignore` had been excluding): the server re-ran its check, the check
  rewrote `target/`, and round it went — clearing and republishing the file's
  diagnostics about once a second, and re-anchoring, re-indexing and running
  `git status` on every one of the hundreds of events a second it produced.
  Cargo's build directory is now always ignored where a `Cargo.toml` says the
  directory is Cargo's.

- **A docked panel fills its dock.** The shown tab was a `contents` box, which
  dissolves the element — the panel then sized itself to its own content, so a
  Problems header occupied a third of a wide bottom dock with the rest of the
  row empty. Every docked panel now fills the group it is in.

- **A task's first error is no longer invisible.** Two escapes stood between a
  command's output and the Problems panel: the window title a shell writes in
  front of the first output line, and the carriage return a progress bar uses to
  draw over itself — cargo prints `Building […]`, returns to column 0 and writes
  `error[E0308]: …` over it, all on one line. Both hid exactly the first
  diagnostic of a run, from the problem matchers and from the test explorer's
  verdicts alike.

- **⌘F puts the caret in the search field.** Find opened the panel and then handed
  focus straight back to the document, so the first thing typed went into the file
  instead of the query — and a second ⌘F while the panel was open did nothing at
  all. Focus now lands (and lands again) where you are about to type.

- **Dialogs no longer disappear behind the browser preview.** The preview pane is
  a native webview that paints above every bit of Reado's own UI, and only a
  hand-listed set of overlays knew to hide it — so the update prompt (and any
  other dialog not on that list) opened underneath it. Every `Modal`/`Drawer` now
  registers itself, so the preview steps aside for all of them.

## [1.19.0] — 2026-09-12

### Added

- **Jupyter notebooks open as notebooks.** A `.ipynb` used to be a wall of JSON;
  it now renders as its cells — markdown as prose, code with its execution number
  (which is often *not* the order the cells are in), and under each code cell the
  outputs the file was saved with: the printed lines, the returned value, the
  figure, the traceback with its terminal colour stripped. Rich HTML output goes
  through the same sanitiser as project markdown, because a notebook is a
  document that arrived from somewhere else. The source toggle beside it is the
  same one markdown has, and that is where editing and the comment gutter stay.
  Running is one button for the whole notebook (`jupyter nbconvert --execute`, in
  a terminal) rather than one per cell: without a kernel session there is no such
  thing as "this cell, in the state the last one left it", and a per-cell button
  that quietly re-ran everything would be a lie.
- **Accessibility, as something you can switch on.** A live region says what the
  screen otherwise shows: the line the caret moved to, its text and any problem
  on it; a diff announces how many regions changed and, on each jump, which one
  of how many, how many lines it adds and removes, and where — because a diff is
  read by colour, and colour is the one thing a screen reader cannot relay. The
  editor's text area is named after the file it holds, so two split panes are
  told apart. Optional audio cues give an error under the caret and a finished
  test run a sound rather than only a hue. Both are off by default and live under
  Settings ▸ Interface ▸ Accessibility: Reado cannot see whether a screen reader
  is running, and guessing wrong either floods a reader or silences one.
- **A Test Explorer.** The project's tests, as a tree, read out of the source
  rather than asked of a framework — so the list is there before anything is
  installed, for vitest/jest, `cargo test`, pytest and `go test`. Run all of
  them, one file's, or one test; the run happens in a terminal pane, where a
  framework's colour and stack traces read the way they were written, and the
  tick or cross lands on the test as its line goes past. Every test also carries
  a run arrow in the editor's gutter, tinted by how it last went, and a test row
  opens the file at the line it is declared on.
- Git's remaining half, all from Source Control ▸ More actions. **Merge** a
  branch into this one, **rebase** onto another, or plan the rebase commit by
  commit: an interactive rebase is a list you edit — keep, squash, fixup, drop,
  and arrows to reorder — and the todo file git would have opened in an editor is
  written from it. A conflicted merge, rebase, cherry-pick or revert now ends the
  way that operation actually ends: the resolver asks the repository what is in
  progress and offers **Continue** for a rebase where a merge offers Commit,
  instead of sending everyone to the terminal for `--continue`.
- **Worktrees and submodules**, listed and acted on from the same menu. A
  worktree opens as a project (the same this-window / new-window question as any
  folder), a new one defaults to a sibling directory rather than a path inside
  the repository, and an uninitialised submodule is one click from being cloned —
  which is the answer to "why is that directory empty" often enough to be worth a
  button.
- **Signed commits**: a toggle that writes `commit.gpgsign` and `tag.gpgsign`
  into the repository's own git config, rather than a Reado setting that would be
  a second source of truth for something every other git tool already reads.
- **A commit graph** (Source Control ▸ More actions, or the palette): every
  branch at once with the lanes drawn, tags and branch tips labelled, and a
  commit selectable to diff the editor against it. Lanes are assigned the way
  git's own graph does it and freed as soon as nothing is waiting in them, so a
  long history stays a few columns wide.

### Fixed

- A task's problem matcher never matched anything. Terminal output is
  base64-framed on its way through the event boundary — so escape sequences and
  non-UTF-8 bytes survive — and the matcher was reading the frame rather than the
  text inside it. It matched nothing, and matched nothing *silently*, which is
  why a task could look wired up and never put a single entry in the Problems
  panel. Both the task matcher and the test runner now decode first.
- A command run in a freshly opened terminal pane could be swallowed. A pane
  exists in the layout the moment it is created, but its shell is spawned a frame
  or two later by the component that draws it, and writing into that gap was not
  an error — there was simply nobody to write to. Input for a pane that has not
  spawned is now held and delivered the moment it does, so nothing that opens a
  pane and runs something in it has to know about the gap.
- A line of output split across two reads is no longer lost. The terminal is read
  in 8 KB blocks, so a boundary lands mid-line routinely in a long run; each
  reader split its own chunk, saw two halves of a line and matched neither —
  leaving a test that passed showing as still running. Lines are now framed once,
  where the stream is decoded.

## [1.18.0] — 2026-09-12

### Added

- Untitled buffers: ⌘N opens an empty `Untitled-1` you can start typing into —
  with no project open too, which is when a scratch buffer is wanted most. It is
  a tab like any other (switch away, split it, close it) and its text lives in
  Reado rather than on disk, so nothing reads or writes a file for it. Saving one
  asks where it goes and turns the scratch tab into the file's tab, in place;
  closing one with text in it asks first. They come back with the session, text
  and all. ⌘N used to be New File… (which asks for a path first); that is still
  in the File menu and the palette, without the shortcut.
- Editor groups: more than two panes. Split the editor (⌥⌘\\ or View ▸ Split
  Editor into a New Group) as many times as you need; each group is a real pane
  with its own tabs, its own file and its own back/forward history. ⌘1…⌘9 jump
  between them, opening a file lands in the group you are looking at, and closing
  a group's last tab closes the group and hands focus to a neighbour. The
  arrangement is saved with the project.
- Semantic highlighting: colour from the language server laid over the grammar's.
  The grammar guesses from the shape of the text; the server knows a type from a
  value and a parameter from a local. Reado's palette stays six colours — what
  colour should not carry is carried otherwise: a parameter is italic, a
  deprecated symbol is struck through. Off with one setting, which also stops the
  requests.
- Project tasks: write the commands everyone runs into `.reado/tasks.json` (or
  reuse the `.vscode/tasks.json` you already have) and run them from the palette,
  the Terminal menu, or ⇧⌘B for the build task. They run in a real terminal pane,
  and their output is matched into the Problems panel — file, line and message,
  clickable, attributed to the task that produced them. Re-running a task
  replaces its own entries rather than piling up.
- Settings profiles: named configurations — settings, enabled extensions and
  keybindings — switchable from the status bar or the palette. Switching saves
  what you changed before it loads the next, so edits are never rolled back
  behind your back. Profiles export to a file and import on another machine.
- Conditional keybindings: a binding may carry a `when` clause
  (`Mod+K = terminal:clear when terminalFocus`), so one key can mean different
  things in the editor, the terminal and a text field. An unconditional binding
  is the fallback; a clause naming a context Reado doesn't know is reported
  rather than silently never matching.
- Git beyond the daily loop, all from Source Control ▸ More actions: amend the
  last commit (with its message offered for editing, and a warning when it is
  already pushed), revert a commit, cherry-pick one from another branch, create
  and delete tags, and manage remotes. A revert or cherry-pick that conflicts
  says so and leaves the files for the conflict resolver.
- A two-finger swipe walks the files you have been reading — right for back,
  left for forward, the same history the breadcrumb arrows and ⌥⌘← use. Not the
  webview's page history, which would leave the project. A gesture that is mostly
  vertical is left alone, and so is one that something under the pointer actually
  scrolled with (a long line read to its end with wrap off, a wide table) —
  judged by whether it really moved, since the editor's own scroller reports room
  it does not have.
- Code lenses: the language server's "3 references" / "2 implementations" lines,
  drawn above the symbol they describe. Clicking one goes there — straight to the
  single place, or to a list of `file:line` to pick from — and a lens whose
  command belongs to the server is handed back to it. Off with one setting
  (Settings ▸ Editor ▸ Code lenses), which also stops the requests — and tells
  the server, which otherwise keeps computing them for nobody.

### Fixed

- Reado now asks the language server for what it computes per document. The one
  scheduled request went out before the `initialize` answer came back — and
  capabilities arrive *with* that answer — so it was skipped as unsupported and
  nothing ever asked again. Open a file and don't type in it, and server folding
  ranges and document links were never requested at all. They are now.
- Switching a dock tab no longer kills what is behind it. Going from Terminal to
  Output unmounted the terminal, and a terminal pane kills its shell when it
  unmounts — so the tab you came back to was empty and whatever was running in it
  was gone. Every tab in a group now stays mounted; only the active one is shown.
- The browser pane stops polling a page that isn't there. Once it had been opened
  without a dev server running, hiding it (another dock tab, a collapsed area)
  left the drain loop calling into a webview that had been closed — one
  `preview_eval failed … no preview pane running` in the log every 700ms, forever.

## [1.17.0] — 2026-09-11

### Added

- Terminal tabs can be dragged to reorder them, and renamed from the right-click
  menu on the tab itself (it was already there on the pane).
- Spanish, French and German interfaces, complete against English, and the
  startup language now follows the OS for any language Reado ships. The locale
  list is one registry, so the picker, the loaded messages and the types cannot
  disagree; a test fails if a locale drops a key or a `{placeholder}`.
- Named terminal profiles: define `Node REPL = node` (Settings → Terminal) and
  open a terminal from it through the caret beside the + button. Panes carry the
  profile's name, and a restart re-runs it.
- Run Selected Text in Terminal (the palette, the Terminal menu): sends the
  editor's selection — or the cursor's line — to the focused terminal, opening
  one if none is.
- A portable workspace file (`.reado-workspace`): save the folders you have open
  as one file, commit it, hand it to someone else, and open it with a double
  click. File ▸ Open Workspace… / Save Workspace As…; adding or removing a folder
  updates the file the window was opened from. Folders opened directly keep
  using `.reado/workspace.json`, unchanged.
- Local file history: Reado parks a copy of a file's previous content on every
  save, independent of git, and the Timeline panel lists them above the commits —
  so the version from twenty minutes ago is recoverable even for a file that was
  never committed. Diff against any of them, or restore one (⌘Z takes it back).
  Kept to 50 copies per file and 30 days, under `.reado/.history/`.
- An Output panel: Reado's own log, in the app, one channel per source — with
  each language server's output among them, so a server that refuses to start
  says why without leaving the app. Filter by channel, level and text; follow the
  tail; copy or clear. It lives as a tab of the bottom panel beside the terminal,
  where VS Code keeps it (View ▸ Output, or the palette); an existing layout gets
  it added there once.
- Go to Symbol in Project also asks the language servers: symbols that are
  generated, or live in a dependency, now appear beside the ones Reado's own
  index finds. The index still answers first, so the picker never waits.
- Folding by what the language server knows: an import block, a `#region`, a run
  of comments — regions the syntax tree has no single node for — now fold from the
  gutter. Syntax folding still covers everything the server says nothing about.
- Document links from the language server: the path in a `tsconfig`'s `extends`,
  a `$ref` in a schema, any range the server reports, opens on ⌘-click — a file in
  the editor, a web address in the browser pane.
- Linked editing: rename an opening HTML tag and its closing tag follows, in one
  undo step, wherever the language server reports the ranges as linked.
- Format on paste and format while typing (Settings → Files → On save). Pasted
  code is re-indented to where it lands, keeping its own shape, in one undo step;
  with a language server, the characters it asks about (a closing brace, a
  semicolon) re-format their line. Both off by default.
- Column selection mode: a plain drag selects a rectangle while it is on
  (⇧⌥⌘C, the View menu, the palette, or Settings → Editor), with the mode shown
  in the status bar. ⇧⌥⌘↑/↓ add a cursor per line and ⇧⌥⌘←/→ widen every cursor,
  with or without the mode.
- Find in selection in the editor's find panel: a fourth toggle beside Aa / ab /
  .* confines finding, the match count and Replace All to the selected range —
  opening the panel with more than one line selected turns it on for you.
- A wrap column: with wrap on, long lines can break at a column of your choosing
  instead of at the window's edge, so the wrap point and the ruler agree however
  wide the window is (Settings → Editor).

### Changed

- Every window is named after its project (`my-project — Reado`) on every
  platform, and macOS is told to keep the string while not painting it over the
  content. That string is what the Window menu, the Dock's window list and the
  taskbar read: with two projects open — one minimised or hidden — there was
  previously nothing to tell them apart or to click to get one back. The Window
  menu is also registered with macOS as *the* windows menu, which is what makes
  it list the open windows at all.
- Rename (F2) asks the language server for the range it would rewrite before
  asking you for a name: a decorator, a `$variable` or a `--custom-property` now
  renames as a whole, and a symbol the server cannot rename says so instead of
  prompting first and refusing after.


- **The knowledge graph now draws the links, not the folders.** It used to draw
  containment only — a document sits in a folder, a note sits on a file — which
  is what the file tree already shows, and on this repository that produced 187
  look-alike nodes in a ring, 64 of them labelled `spec`, 418 pairs of
  overlapping labels, and 67 disconnected pieces (65 of them a lone hub beside a
  lone child). What a tree can't show is the links documents make to each other,
  and those are read out of the markdown itself. The same project now draws 125
  nodes with 35 real references between documents, no repeated label, and no
  overlapping ones. Alongside that:
  - The canvas **zooms and pans** (wheel to zoom about the pointer, drag the
    background to pan, "Reset view" to go back), so a large graph can be read up
    close instead of only from too far away.
  - The **legend switches layers off** — docs, specs, notes, files — and takes
    their edges with them.
  - **Labels appear where they can be read**: on the anchors and the
    best-connected nodes, on hover along with a node's neighbours, and on
    everything once you zoom in. A node nothing connects to is drawn quieter
    rather than at full strength, and a label at the right edge reads inward
    instead of off the canvas.
  - A spec group holding a single document **is** that document, named for the
    capability, instead of a hub beside a child called `spec`.
  - Documents are grouped by the folder they live in, rather than every one of
    them hanging off a single hub whose spokes crossed the whole canvas.
- **The knowledge base index is grouped and foldable.** It listed 120 entries in
  three flat columns, labelled with full paths that truncated on the half that
  identifies the document (`docs/testing/testbook/01-launc…`). Documents are now
  named by their file under a header for their folder, each group counted and
  collapsible, and a capability whose group holds one document appears once
  under its own name.
- Vue files are served by `typescript-language-server` carrying
  `@vue/typescript-plugin`, instead of by `@vue/language-server`. Vue 3's
  language server is hybrid-only: it holds no TypeScript of its own and relays
  every type question to a tsserver, so run on its own it answered nothing — no
  completion, no hover, no diagnostics in any `.vue` file. The plugin is the half
  that does the work, and with it a `.vue` file gets the script block's
  completions and the template's, `<script setup>` bindings in scope. Install it
  with `npm install -g typescript-language-server typescript @vue/typescript-plugin`;
  a project that carries the plugin itself uses its own.

### Fixed

- The browser pane can no longer be dragged out of the panel it lives in. It is a
  real OS child window parked over the pane, and it was left resizable, so a drag
  aimed at the dock's resize handle stretched the browser past its panel; the
  handle also straddled the panel edge, putting half its grab area under that
  window. The window is now fixed (Reado owns its frame) and the handle sits
  entirely outside the region, where nothing can cover it.
- The credential picker in the browser pane shows one credential as one control:
  the login and its one-time code now share a single bordered shell instead of
  reading as two buttons of different weights.
- A menu opened by a left click no longer closes in the same click. React flushes
  the state that mounts the menu while that click is still travelling to the
  window, so the menu's own outside-click listener caught it; the listener now
  waits a frame. Right-click menus were never affected, which is why it only
  surfaced on the terminal's new profile picker.
- A new terminal is no longer named after a tab that already exists. The name
  counted the open panes, so closing "Terminal 1" and opening another one gave a
  second "Terminal 2"; it now takes the lowest free number.

- Code intelligence in a monorepo, or in any project whose root holds no project
  of its own. Language servers look in the root they are given and nowhere else,
  so opening the repository root — the normal way to work on a monorepo — left
  every file with an error and no completion. Reado now finds the project below
  the root (three levels down at most) and tells the server where it is:
  - **TypeScript / JavaScript**: `typescript-language-server` exited during
    `initialize` ("Could not find a valid TypeScript installation…"). It is now
    handed the TypeScript of the package that owns the file (`tsserver.path`), so
    a workspace on TypeScript 4.6 is served by 4.6 and not by whatever `tsc` is
    installed on the machine. A TypeScript 7 anywhere — the root's, a package's,
    or the global one — answers LSP itself through `tsc --lsp`, and a globally
    installed TypeScript is the last resort for a folder of loose `.ts` files.
  - **Rust**: rust-analyzer answered "Failed to discover workspace" and served
    nothing; it now gets the `Cargo.toml` of each workspace under the folder as
    `linkedProjects` (a manifest inside another workspace is left alone — handing
    over both is an error).
  - **Angular**: an app below the opened root was not recognised as an Angular
    project at all — Reado looked for `angular.json` in the root and nowhere
    else — so every component `.ts` went to the plain TypeScript server. The
    project is now the nearest `angular.json` at or above the file, and the
    server runs rooted there, so a repo with several Angular apps serves each as
    its own project.
- Clicking a node in the knowledge graph does something again. Any pointer
  movement at all counted as a drag and suppressed the click, and a real mouse
  always moves a pixel or two, so nodes simply never opened. A drag now needs 4px
  of travel. Dragging a node in a settled graph also repaints instead of leaving
  it painted where it was.
- A language server that fails to start or to initialize is no longer retried on
  every keystroke — it spawned a fresh process and raised a fresh error toast
  every few seconds for as long as the file stayed open. Failures now wait 30s
  before the next attempt.

## [1.16.1] — 2026-09-10

### Fixed
- **⌘-click goes to the definition, or says why it can't.** Three ways it could
  come up empty and tell you nothing: the language server had started but never
  finished initializing, so the click was handed to a request that could never
  arrive; the server answered with no location and the reply was dropped; or the
  request failed and the error was swallowed. In every case the code had already
  claimed the jump, so the symbol index — the fallback that knows the project's
  own declarations — was never consulted. A server is only trusted once it has
  answered, and anything it cannot resolve now falls through to the index, which
  says so when it has nothing either.
- **Copying actually copies.** "Copy log path" (from the Help menu and from
  Settings), the Reado Anywhere pairing URL and "Export settings to the
  clipboard" all went through the web Clipboard API, which the webview refuses
  without a secure context and a user gesture. The rejection was caught and
  dropped, so the clipboard simply kept whatever it had and nothing said
  otherwise — verified against the running app. They use Tauri's clipboard
  plugin now, as the rest of the app already did, and a failed copy is reported.
- **Go to Line opens one panel, in your language.** Asking for it again while it
  was already open stacked a second identical "Go to line" panel — and a third,
  and a fourth — each needing its own dismissal. It now takes you to the one
  already there. CodeMirror's own strings are also translated now: the Go-to-line
  dialog, the fold placeholder, the diagnostics panel and the search counters
  stayed in English inside an otherwise translated app.
- **The selected file's name stays readable.** A file you have read is dimmed to
  say so, but the selection tint lightens the row underneath it, and muted ink on
  that measured 3.9:1 — under the 4.5 Reado holds its own themes to, on the one
  row you are actually reading. The row you are on is no longer dimmed. With this
  and the theme-picker fix, every piece of interface text in all four built-in
  themes now clears WCAG AA, measured in the running app.
- **The theme picker's names are readable again.** Each tile applied the theme it
  previews to the whole tile, so a light theme's *name* was drawn in that theme's
  ink on the dark settings surface: a measured contrast ratio of 1.6, against the
  4.5 the same picker holds contributed themes to. "Reado Chiaro" and "Reado
  Seppia" were all but invisible in dark mode, and the dark ones would have been
  in light mode. Only the swatch carries the previewed palette now.
- **The status bar names the file's encoding once.** A hardcoded "UTF-8" label sat
  beside the encoding picker, so the bar read "UTF-8 … utf-8" — and on a file that
  is not UTF-8 it would have gone on claiming otherwise next to the true value. It
  was also the one item there you could not hide.
- **"Compare with…" in the file tree actually compares.** Picking one file, then
  choosing it on a second, opened the second file and showed no comparison at
  all: it opened the file and switched the diff on in the same breath, and
  opening a file resets the pane to its default view a moment later, wiping it.
  It goes through the same request the Source Control panel uses.
- **Marking a conflict resolved takes you back to the file.** It staged the file,
  as it should, and then left you sitting in the resolver for a file with no
  conflicts left — its only button offering to mark it resolved again, and no
  obvious way out.
- **Source Control opens the file you clicked, even when it is already open.**
  Clicking a conflicted file opens it in the resolver and a modified one as its
  diff — unless that file was already on screen, in which case the click did
  nothing: the request was only read when the active file changed. Worse, it
  stayed queued, so the next unrelated file you opened inherited it and arrived
  inside someone else's merge. Opening a file plainly also now leaves any
  conflict resolution behind, as it already did for diffs.
- **Jumping to a problem puts the cursor there.** Clicking an error in the
  Problems panel scrolled to the line and lit it up, but left the caret wherever
  it had been — line 1 of a file that had just been opened — so the first arrow
  key or keystroke threw you back to the top of the file. The same was true of
  every other jump that lands on a line. It also left the app disagreeing with
  itself: clicking a symbol in the outline, and F12, both move the caret. Focus
  still stays where you clicked from.
- **"Open results in an editor" opened an empty box.** The careful alternative to
  Replace All — every hit as text, edited by hand — showed a title, a hint and
  "Apply 0 changes" over nothing at all. Its CodeMirror view is created into a
  host that lives inside the modal, and the modal mounts its content a commit
  after it opens; the effect that creates the view ran while the ref was still
  null, bailed, and with unchanged dependencies never ran again. A callback ref
  creates it exactly when the host appears.
- **Four settings were unreachable by search.** Word wrap, sticky scroll, focus
  mode and the structure ribbon had no entry in the settings index at all, so no
  query in any language could find them — you had to know which of the five tabs
  they lived on. They label themselves from `editor.*` rather than `settings.*`,
  and the test that exists precisely to catch a control with no entry only looked
  for `settings.*` labels, so it waved them through. The test now reads any
  namespace. Search also matches a setting by its own name — the one shown in
  Settings (JSON) one button away — so `formatOnSave` finds it even in a UI where
  the label reads "Formatta al salvataggio".
- **The terminal starts even when the window isn't painting.** The PTY was
  spawned from a `requestAnimationFrame` callback and from nowhere else. A window
  that isn't rendering — occluded, minimised, off-screen — is given no frames, so
  no shell was ever started: the pane opened black and stayed that way, with no
  error and nothing to click. The frame is still what sizes it; it is no longer
  what starts it.
- **TypeScript errors show up again.** On a TypeScript 7 project — which is any
  project whose `node_modules/typescript` no longer ships `tsserver.js`, Reado's
  own included — the Problems panel was empty and no squiggle ever appeared, for
  every file, forever. TS 7 answers `textDocument/diagnostic` when asked and never
  volunteers `publishDiagnostics`; Reado only listened for the volunteering, while
  the client library told the server we handled the asking. So the server waited
  politely and Reado waited too. Diagnostics are now pulled on open, after an edit
  settles and after a save, and the problems a server reports about *other* files
  while checking this one land in the panel with them.
- **F2 renames.** The binding sat in the language-client extension list, where a
  bare keymap is not reliably installed into the editor, so the key did nothing
  while the same command worked from the context menu. It now lives with F12 and
  the rest of the editor's LSP keys.
- **The semantic index stopped losing writes.** `database is locked` appeared
  9,773 times in a single session's log: the index is written by a full rebuild
  and by a per-file reindex, both on worker threads, and in SQLite's default
  journal mode the loser fails instantly — a five-second `busy_timeout` never got
  a chance, because a deferred transaction that already holds a read lock is
  refused outright rather than made to wait. The index is WAL now and every writer
  takes its lock up front. Two rebuilds that met also raced on `DROP`/`CREATE`
  ("table docs already exists"); the schema swap moved inside the transaction, so
  a rebuild is atomic and a reader never sees half an index.
- **The comment index is atomic too.** Same class of bug, in the other index: the
  rebuild dropped the table, recreated it and inserted one comment at a time, all
  outside a transaction. Anything reading `.reado/index.sqlite` while a rebuild
  ran saw an empty or half-filled table — no error, just a wrong answer — and two
  rebuilds meeting collided on the `DROP`. The whole rebuild is now one
  transaction that takes its write lock up front, and the index is WAL, so a
  reader keeps reading the previous index until the new one is complete. Filling
  it also no longer re-parses the same statement once per comment.
- **Versioning `.reado/` no longer commits your machine's scratch.** The ignore
  rule for the shared-annotations mode listed the comment index, the trash and the
  undo copies, but not `semantic.sqlite`, `read.json` or `read-snapshots.json` —
  so turning versioning on published a rebuildable index and how far you personally
  had read. The list lives in one place now, and the test asserts it covers
  everything Reado actually writes rather than repeating three names by hand.
- **Language servers can register file watchers.** Every session opened with
  `failed to register configuration change watcher: Method not implemented`: the
  client library refuses *every* request a server makes of it. `client/registerCapability`,
  `workspace/configuration` and `window/workDoneProgress/create` are answered now,
  and — the other half of saying yes — a file changed outside the editor is
  reported to the servers that asked, so a `git checkout` no longer leaves them
  reasoning about a tree that is gone.
- **A language server that fails to start says so.** One that starts and then
  refuses to initialize (`typescript-language-server` in a project with no
  TypeScript) rejected a promise nobody was holding: an unhandled rejection in the
  console, no notice, and the editor still reporting code intelligence for a
  process that had exited. It now reports the failure once and drops the
  connection so the next interaction starts fresh. Relatedly, "is a server
  attached" meant "does a plugin object exist" — which also switched *off*
  word-based completion, so a dead server left you with no completions at all
  rather than the fallback.
- **Rename a symbol and every call site follows.** F2 renamed the symbol in the
  files you happened to have open and left every other use of it on the old name
  — no error, no count, nothing to notice until a build failed. The editor
  library applies a rename only to files its workspace already holds, and that
  workspace only knows files with an editor attached. Rename now goes through the
  same path code actions use: closed files are rewritten on disk, the whole
  rename is one ⌘Z, and a toast says how many files it touched — so a rename the
  server could only partly resolve is visible instead of silent.
- **Replace now rewrites what the search found.** Search and replace had drifted
  apart: the panel matched with the Aa / whole-word / `.*` toggles and the
  rewrite went through literally and case-sensitively, so Replace All on a regex
  search rewrote the pattern text itself, a case-insensitive search replaced only
  the exact-case occurrences, and the "files to include" field went unread — the
  rewrite could reach files the results list never showed. Both replaces now take
  the search's own toggles and globs, `$1` expands against the capture groups on
  a regex search (and stays literal text on a literal one), and an unparseable
  pattern is reported instead of rewritten.
- **"Replace this result" replaces that result.** The position identifying a
  match was 0-based bytes coming out of search and read as 1-based characters
  going into replace, so replacing one row off a list quietly hit the neighbouring
  occurrence, or nothing at all. Both ends now speak the search's convention.
- **Search without ripgrep honours every toggle.** The in-process fallback used
  when `rg` isn't installed matched literally on a lower-cased copy of each line,
  so whole-word and regex searches came back wrong and the reported column could
  be off on non-ASCII text. It runs the same matcher the rest of search does.

## [1.16.0] — 2026-09-09

### Changed
- **The credential prompt is a chip in the page**, where the login form is and on
  top of it — the pane is a native child window, so the strip in the chrome was
  the only thing Reado's own DOM could put anywhere near it, and it was a thin,
  dim thing you had to go looking for. It carries titles and usernames only; the
  password is still fetched after you pick and goes nowhere but the field.
- **Extensions install themselves.** An install used to be handed to your
  terminal: the panel opened, the command was typed into whichever session you
  had going, and you watched a package manager scroll. Reado runs it in a shell
  of its own now — a toast when it starts, a toast when it lands, and the
  installer's output in the log if it doesn't.
- **The credential strip offers itself on a login page**, the way a browser
  extension does, instead of waiting behind a toolbar icon to be found.

### Fixed
- **The editor has completion of its own.** The popup only ever existed as part
  of the language-server extension, so a file with no server — every language
  Reado has no server for, and every file in the seconds before one attaches —
  had no completion at all, not even the words already on screen. It is the
  editor's now: the language's own completions, the server's when there is one,
  and the document's words underneath. Tab accepts, as it does everywhere else.
- **The browser pane is a browser.** Navigating — a link, a redirect, a router
  pushing a route — left the address bar showing whatever was last typed, so it
  lied about where you were. Worse, a scan running every two seconds re-navigated
  the pane to that stale address (or to any dev server it had found), which
  snapped a page you had just opened back to the start and threw away the history
  Back would have walked. Back, Forward and Reload appeared broken because there
  was nothing left for them to work on. The pane now follows the page: the address
  is the page's own, and a loaded page is left alone.
- **Suggestions appear as you type.** They defaulted to off — read-first taken to
  mean the editor should offer nothing until asked — which reads as a broken
  editor: you type a name that needs an import and *nothing at all* happens, with
  no way to tell a quiet editor from a dead one. Existing installs are switched on
  once; turning it back off sticks.
- **The language server's suggestions reach the popup at all.** The source was
  rebuilt every time the editor asked for it, and CodeMirror matches a finished
  query to the source that started it by identity — so every answer arrived
  belonging to a source that no longer existed and was thrown away. The server
  replied in milliseconds and the popup showed everything except what it said.
- **Imports are suggested again — and actually inserted.** Completing a symbol the
  file never imported typed the name and left the file broken: a server sends an
  auto-import item as a bare name plus an opaque handle, and the edit that adds
  the `import` line exists only once the client asks for it. Nothing ever asked.
  Reado makes that request now, and applies what comes back.
- **TypeScript 7 projects get a language server that works.** TS 7 is the native
  compiler — there is no `tsserver.js` left for `typescript-language-server` to
  drive, so it loaded a stub, reported itself as version 1.0.0 and advertised no
  completions at all: installed, running, and useless. Such a project now talks to
  the LSP server in its own compiler, and needs nothing installed to do it.
- **Backspace no longer throws the session away.** Outside a text field a webview
  reads it as "go back", and back from Reado's only page unloaded everything —
  project, editors, terminals — with no undo. It, and Alt+←/→, are cancelled now.
- **Installing a language server takes effect on the file you're looking at.** It
  used to change nothing until the window was rebuilt: the file whose missing
  diagnostics sent you to install it stayed exactly as dead as before.
- **A search match no longer lands under the sticky scope headers.** They float
  over the top of the editor, so anything scrolled to the top edge — a find
  result, a go-to-line, a definition jump — sat behind them, and the click meant
  for that line hit a header and jumped to the top of the enclosing scope.
- **The credential strip stays open after it fills a login**, so the one-time
  code is still there when the site asks for it. It used to close on the fill and
  take the second half of the sign-in with it.
- **One 1Password approval instead of one per command.** `op` asks the 1Password
  app to authorize every invocation it makes, and a single fill is several
  (list the logins, read each one, fetch the password, fetch the code). Reado
  signs in once now and reuses the session, re-signing in only when it expires.
- **A missing language server says so.** No server meant no diagnostics, no
  import completions and go-to-definition down to whatever the symbol index had
  seen — silently, which read as a broken editor rather than a missing tool.
  ⌘-click that resolves nothing says that too.

## [1.15.0] — 2026-09-08

### Added
- **Quick Fix and code actions (`⌘.`).** The language server's fixes, refactors
  and source actions, grouped so "add the missing import" and "move this to a new
  file" don't read as the same kind of decision. Edits that span several files
  reach all of them, including the ones you don't have open.
- **Organize Imports**, as a command of its own — it asks for that one source
  action and runs it rather than making you pick from a menu of one.
- **Keyboard shortcuts you can change.** The bindings were a hand-written chain;
  they are a table now, editable as `combo = command` text from the shortcuts
  dialog. Rebind a key, add one, or leave the command empty to hand a key back to
  the editor. Every binding names a command the menu also dispatches, so a
  rebound key and a menu click can't diverge — and the command palette shows
  whatever is bound *now*, including a key you rebound, rather than a shortcut
  typed out beside each row.
- **Search results as an editable document.** "Open Results in an Editor" lays
  every match out as text; edit the ones that should change, leave the rest, and
  Apply rewrites only the lines you touched — the careful alternative to Replace
  All. One undo takes the whole thing back.
- **Workspaces: more than one folder in a window.** Add Folder to Workspace puts
  a second checkout in the same tree; the file tree lists each folder, and search,
  Go to File and Go to Symbol span all of them. Every read and write is scoped to
  the folder that owns the file, so each keeps its own `.reado/`, its own trash
  and its own undo. The folder list lives in the first folder's
  `.reado/workspace.json`.
- **`.editorconfig`.** A project's own file now decides indentation, line
  endings, trailing-whitespace trimming, the final newline and the ruler for its
  files — outranking both Reado's detection and the reader's own settings, which
  is the entire reason to commit one. Resolution follows the spec: nearest file
  wins, `root = true` stops the walk.
- **Replace one match, or one file.** The search panel's right-click menu can now
  rewrite the occurrence you clicked or every occurrence in that file, instead of
  offering only all-or-nothing.
- **Text encodings.** A latin-1, Shift-JIS or UTF-16 file opens as the text it
  is rather than as "binary" or mojibake, is written back in the same encoding,
  and can be reopened in another one from the status bar. A save that would need
  characters the encoding can't hold is refused instead of writing `?` over them.
- **The settings, as JSON.** A text view of every preference — diffable,
  pasteable, editable — that reports the keys it couldn't use instead of applying
  them silently.
- **A setting the project pins now says so**, with a one-click way to stop it
  overriding, next to the existing "you changed this" mark.
- **Two-key shortcuts.** `⌘K` is a prefix now that `⇧⌘P` also opens the palette:
  `⌘K ⌘K` palette, `⌘K ⌘S` shortcuts, `⌘K Z` zen, `⌘K V` preview, `⌘K W` close
  all, `⌘K P`/`⌘K R` copy path / reveal, `⌘K ⌘0`/`⌘K ⌘J` fold and unfold all, and
  **`⌘K ⌘1…⌘9` to fold to a level**. The status bar shows the prefix while it is
  armed; Escape or an unrecognised key cancels it.
- **A navigable breadcrumb.** Each folder segment lists what is beside the file
  you are reading; the file segment lists its own symbols and jumps to one.
- **File nesting.** A lock file tucks under its manifest and a compiled file
  under its source, so the tree shows what you wrote rather than what a tool
  produced. Off by default; the rules are editable and travel in the project
  config.
- **Preview tabs.** A file you click into in the tree or a search result opens
  as a preview that the next one replaces — a session of reading leaves one tab
  behind instead of forty. Double-click, edit, or pin it to keep it.
- **Pinned tabs**, which sort to the front and survive Close Others / Close to
  the Right / Close All.
- **Emmet.** `div.card>ul>li*3` expands on Tab in HTML, CSS/SCSS/Less, Vue,
  Svelte, Astro and inside JSX. Deliberately quiet: it declines outside markup,
  inside comments and strings, on a bare word, and with a selection — so Tab
  keeps indenting everywhere else.
- **Shortcuts the muscle memory expects**: ⌘W closes the editor, ⌘S saves from
  anywhere (not just with the editor focused), ⌥⌘S saves every pane, ⌘N / ⌘O
  create and open, ⌘1 / ⌘2 focus the editor panes, ⇧⌘P opens the command palette
  (and ⌘K became a chord prefix — see below), ⇧⌘V toggles the preview, ⌃⇧` opens a terminal, and ⌃J joins lines.
- **The menu now shows its shortcuts** on all three platforms — as real
  accelerators in the macOS menu bar, as hints in the Windows/Linux one. The list
  is written once (`lib/appMenu.ts`) and a test fails the build if the native menu
  drifts from it. Only combos whose menu command matches their in-app binding are
  listed, so ⌘Z still reaches the editor and ⌘D still duplicates in the tree.
- **Text and line transforms**: Transform to Upper/Lower/Title Case, Sort Lines
  Ascending/Descending, Delete Duplicate Lines, Join Lines, Trim Trailing
  Whitespace, Reindent Lines, Convert Indentation to Spaces/Tabs, and Cursor
  Undo/Redo. Each acts on the selection, or on the caret's line when there is
  none.
- **Fold All / Unfold All** (⌘⌥⇧[ / ⌘⌥⇧]) and fold/unfold the innermost scope
  (⌘⌥[ / ⌘⌥]).
- **Format Selection**, through the language server's range formatter.
- **Completion in every file.** The words already in the document are now a
  suggestion source everywhere, so a markdown file or a language with no server
  isn't left with nothing. Quiet by default — ⌃Space asks for it — with a
  *Suggest while typing* setting for the VS Code behaviour.
- **Bracket-pair colouring**, tinting each `()[]{}` by nesting depth and
  underlining a closer with no opener.
- **The tab strip carries its information**: a file icon, a dot for unsaved
  edits, and the parent folder on the tabs whose names collide. Its right-click
  menu gained Close Saved, Reopen Closed Editor, Open to the Side, Copy Path,
  Copy Relative Path, Reveal in Finder and Open in Integrated Terminal.
- **Open Editors** above the file tree — what is open, what is unsaved, and a way
  to close it, which the tab strip can't provide when it is set to a single tab
  or hidden.
- **File-tree filter, refresh and sort.** A filter field narrows the listed rows,
  Refresh re-reads from disk, and folders can be ordered by name, type or last
  modified. A file with unsaved edits is marked in the tree, as on its tab.
- **Compare two files**: Select for Compare, then Compare with "…", on any two
  files in the project.
- **Search gained files-to-include and files-to-exclude**, per-search glob fields
  next to the case/word/regex toggles, plus query history (↑/↓ in the field), a
  per-result dismiss, and a right-click menu to copy a match, its location, or
  every result.
- **Project settings that a team can share.** `.reado/config.json` now covers
  format-on-save, the whitespace toggles, line endings, the exclude lists, the
  ruler, indentation guides, the large-file guard, suggestions and auto-save —
  not just four reading preferences. *Save Settings to This Project* writes the
  file; after that only the keys it lists are tracked.
- **Project snippets** in `.reado/snippets.json`, in VS Code's `.code-snippets`
  format, so one file serves both editors and the snippets travel with the code.
- **Recommended extensions** from `.reado/extensions.json`, surfaced once per
  project as a notice and a section in the Extensions panel. Advisory only.
- **Settings export/import to a file**, alongside the existing clipboard bundle,
  so it can live in a dotfiles repository.
- **A changed setting says so**, with a one-click way back to Reado's default —
  previously the only way to find what you had moved was to reset everything.
- **Terminal settings and a shell of your choosing**: text size, scrollback,
  cursor shape, and an explicit shell with its own arguments. Terminals can be
  renamed, so four of them stop being "Terminal 1..4".
- **Context menus where there were none**: the Problems panel (copy a message, a
  location, or every problem), the search results, the activity bar (hide a view,
  show them all) and the status bar (switch individual indicators off, or hide
  the bar).
- **New settings**: auto-save delay, suggest-while-typing, bracket-pair colours,
  a search-only exclude list, file-tree sort order, and the line endings new
  files get.

### Changed

These are the behaviour changes worth knowing about when you update.

- **`⌘K` no longer opens the palette on its own** — it is a chord prefix now.
  The palette is `⇧⌘P`, and `⌘K ⌘K` still gets there in one hand. The status bar
  shows the prefix while it is armed.
- **The status-bar pickers and breadcrumb menus are real menus.** Indentation,
  line endings, encoding, language, branch, and the breadcrumb's folder and
  symbol lists now take arrow keys and type-ahead, return focus to the control
  they opened from, and flip to the other side of the screen rather than being
  clipped by the window edge.
- **A refused branch checkout is reported as a notice.** Picking a branch closes
  the menu, so a dirty working tree now says so where every other failure does
  instead of inside a menu that is no longer on screen.
- **Preview tabs are on by default.** A file you click into in the tree opens as
  a preview that the next one replaces; double-click, edit, or pin it to keep it.
  Settings ▸ Interface turns it off.
- **Completion now exists in every file** (the words already in the document).
  It stays quiet — ⌃Space asks for it — unless *Suggest while typing* is on.
- **The macOS menu carries real accelerators** on about thirty items. Only
  commands whose menu action matches their in-app binding are listed, so ⌘Z still
  reaches the editor and ⌘D still duplicates in the tree; a test enforces it.
- **`.reado/config.json` is no longer written on its own.** It is created by
  *Save Settings to This Project*, and from then on tracks only the keys it lists.

Known boundaries, deliberately drawn:

- **Source Control stays on the workspace's first folder.** Multi-root covers
  reading, searching and writing, but not per-folder git: the tree's git
  decorations are keyed by relative path, so two folders holding the same path
  can collide.
- **Text-editing keys inside the editor** (⌘Z, Tab, the arrows) are not
  rebindable — they are CodeMirror's contract with the document, not app commands.
- **`.editorconfig`** does not support `{num1..num2}` numeric ranges in globs.
- **Encoding detection** falls back to windows-1252 for non-UTF-8 files; there is
  no statistical guessing, so a Shift-JIS file without a BOM needs one explicit
  "Reopen with Encoding".

### Fixed
- **Saving with two folders open** now writes to the folder the file came from.
  The editor paired a buffer's text with "the project's" root, which with a
  second folder open is the wrong one.
- **Replace All is undoable.** Every file it rewrites is backed up first, so a
  project-wide replace is one ⌘Z rather than forty irreversible writes. It was
  the only destructive operation in the app with no way back.
- **Undo backups don't accumulate forever.** A parked copy is dropped a week
  after it was made — long past anything the 50-deep undo stack can reach, and
  the difference between a `.reado/` that settles and one that grows with every
  Replace All for the life of the project.
- **Cross-file code actions are undoable too.** A rename that rewrites five
  files, only one of them open, now backs up all five and lands on the undo
  stack as one action, like every other bulk rewrite.
- **A versioned `.reado/` no longer commits your undo history.** With
  `versionReado` on, only the index was gitignored — the trash and the new
  pre-replace backups would have been committed along with the annotations.
- **A UTF-16 file is no longer read as binary.** Every ASCII character in UTF-16
  carries a NUL padding byte, which is exactly the signal the binary check looks
  for.
- **Save As keeps the file's line endings and encoding** instead of writing a
  UTF-8, LF copy.
- **Clicking the control that opened a status-bar dropdown closes it.** It was
  closing and immediately reopening, so the toggle never appeared to work.
- **A CRLF file no longer comes back as LF.** CodeMirror normalises every
  document to `\n`, and nothing put the endings back on save — so opening a CRLF
  file and pressing ⌘S produced a whole-file diff.
- **Saving the wrong file with the editor split.** ⌘S paired the focused pane's
  text with the *primary* tab's path, writing one buffer over another file.
- **Language-server completions were dropped in any file with snippets.** The
  snippet source was registered as an `override`, which replaces every other
  source — including the server's.
- **Changing a global preference no longer dirties every open repository.** The
  per-project config used to be rewritten on any settings change, so touching
  your own font left a modified `.reado/config.json` in each project.
- **Cut and Copy with no selection** now take the caret's line, as they do
  elsewhere, instead of doing nothing.
- **Drag feedback in the file tree.** Dragging a row now shows the grabbing
  cursor over the whole window and a label with the dragged file's icon and name
  (plus `+N` for a multi-selection) under the pointer, so dropping onto a terminal or
  another folder is no longer a blind gesture.
- **Clicking a path outside the project in the terminal** now reveals the file
  in the system file manager instead of reporting "isn't in this project" — the
  editor is scoped to the project root, the file manager isn't.

## [1.14.0] — 2026-09-08

### Added
- **Tab indents.** It never did — `indentWithTab` was simply never bound, so Tab
  walked focus out of the editor. Tab now indents the selection and Shift+Tab
  outdents it, and Reado indents with the file's *own* unit: the indentation the
  status bar detects (tabs, or N spaces) is what Enter, Tab and re-indent insert,
  instead of CodeMirror's 2-space default applied to every file regardless.
- **Auto-closing brackets and quotes**, with the matching Backspace, plus
  re-indent as you type a closing token (`closeBrackets`, `indentOnInput`).
- **Editing keys VS Code has and CodeMirror doesn't bind**: ⌘L select line, ⌘↵ /
  ⌘⇧↵ open a line below / above, ⇧⌥I add cursors to every line end, ⌥Z toggle word
  wrap, and the lint keymap.
- **The editor's right-click menu now has the basics**: Cut, Copy, Paste, Rename
  Symbol, Find All References, Peek Definition and Select All Occurrences. The
  webview has no native context menu, so before this there was no way to copy from
  a right-click at all.
- **The find bar counts.** "3 of 17" beside the field, like every other editor's
  (capped on very large documents, where it reads "1000+" rather than stalling).
- **The file tree got its file operations**: Rename (F2 or the menu), Delete
  (Delete, ⌘⌫ on macOS), New File…, New Folder…, Copy Path and Copy Relative Path.
  Rename and delete are both undoable with ⌘Z, like a drag-move already was. The
  arrows walk the rows and open/close folders.
- **The file tree shows what git thinks.** A changed file's name carries its
  status colour and letter (M/A/D/R/U/!), and a folder holding changes gets a
  quiet dot — so a modified file three levels down is visible without expanding
  to find it. Source Control and the tree now read one `git status`, on one poll,
  instead of each running their own.
- **Cut, Copy, Paste and Duplicate in the tree** (⌘X / ⌘C / ⌘V / ⌘D, or the
  menu). A cut is a move — undoable with ⌘Z like a drag — and is consumed by its
  paste; a copy stays on the clipboard for as many pastes as you want, and a name
  clash becomes "file 2.ts" rather than an overwrite.
- **Open in Integrated Terminal** on any folder: the shell starts *there*, not at
  the project root, which is the only reason to want the menu item.
- **The tree navigates like a file list should**: Home / End, and typing a letter
  jumps to the next row starting with it (wrapping). Rows carry their full
  project-relative path as their tooltip, not just the filename.
- **New File / New Folder buttons** in the Files panel header, beside Collapse All.
- **Multi-selection in the file tree.** ⌘/Ctrl+click adds a row, ⇧+click takes the
  range, ⇧+↑/↓ extends it as you walk — and delete, cut, copy, duplicate and drag
  all act on the whole selection. Right-clicking a row *outside* the selection
  acts on that row alone, so the menu can never quietly hit ten files you can no
  longer see. Deleting many stays undoable, one ⌘Z per file.
- **Find in Folder…** on any folder: the Search panel gets a chip naming the
  folder and every search is limited to it — and so is Replace All, because
  showing one folder's matches while rewriting the whole project would be a trap
  rather than a feature. Clearing the chip goes back to the whole project. The
  no-ripgrep fallback honours the scope too, so results don't differ by machine.
- **Open With…** on a file: a second page of the menu listing the viewers that
  actually apply to it — Editor (source), Preview (only where there *is* a rich
  rendering), Diff — with a check on the one in effect. This is VS Code's
  meaning of the command: which of Reado's editors opens it, not which external
  app. Handing the file to the OS is what Reveal in Finder is for.
- **Compare with Saved**, in the editor's right-click menu, the command palette,
  the File menu, and on a tree row with unsaved edits. It diffs the live buffer
  against the bytes on disk — the buffer is captured at the moment you ask,
  because switching to the diff tears down the editor holding it. It asks git
  nothing, so it works on an untracked file and outside a repository.

### Fixed
- **A context-menu item could not keep its own menu open.** The menu is portalled
  to `document.body`, outside React's root container, so the `stopPropagation` it
  relied on never reached the native listener that dismisses it — every in-menu
  click closed the menu whether the item wanted it or not. The listener now tests
  containment, and an item can ask to stay open.
- **The diff base picker showed a blank value** whenever the base was one of the
  non-git sentinels (the last-read snapshot, and now the saved file); those are
  listed while they are in effect.
- **Edits could be lost by switching tabs.** A tab switch tears the editor down
  and re-reads the file from disk; a debounced auto-save still pending at that
  moment fired into a destroyed view and wrote nothing. Unsaved edits are now
  flushed before the editor goes away — with Auto Save off too, where the loss was
  guaranteed rather than a race.
- **⌘Z stopped at the tab switch.** The undo history is parked when a file's
  editor is torn down and restored when it comes back unchanged, so undo reaches
  back past the last time you looked at another file.
- **Unsaved state is tracked per file, not globally.** One shared flag meant the
  split pane's edits were invisible to auto-save (so they were never written), and
  the breadcrumb's unsaved dot reported another file's state.
- **Ctrl belongs to the editor and the terminal again on macOS.** Reado read
  Cmd-or-Ctrl as its command modifier, so ⌃P, ⌃K, ⌃B, ⌃T and ⌃J opened the file
  finder, the palette, the sidebar, symbols and the terminal — on top of being
  readline motion in the editor and tmux's prefix, kill-line and history in the
  shell. On macOS the command modifier is Cmd, and Cmd only.
- **⇧⌥F formatted the document twice** when a language server was attached — the
  server's own binding and Reado's ran on the same key.
- **Go to Line moved to ⌃G on macOS**, freeing ⌘G for Find Next, which is what it
  is everywhere else on that platform.

## [1.13.0] — 2026-09-07

### Added
- **Your password manager, in the browser pane.** A key in the pane's toolbar lists
  the logins your vault holds for the page's origin and fills the form with one —
  including the one-time code, and including generating and saving a new login when
  you are signing up. It talks to 1Password's `op` or Bitwarden's `bw`, whichever is
  installed, so the credential comes from the vault you already trust; nothing is
  read out of a browser profile and no secret is ever cached, persisted or logged.
  (The pane is a system webview, which cannot load browser extensions — this is the
  interface both vendors ship for exactly that reason.)
- **Both CLIs are listed in Extensions.** 1Password's `op` and Bitwarden's `bw`
  show up under their own marks, like anything else Reado can use: installed,
  among your extensions;
  missing, as a row with the install command for your OS and whatever else the
  binary alone doesn't cover. If you run the desktop app and never knew the CLI
  existed, that is where you find out — and the browser pane points you there when
  it can't find one. Each one opens onto a guide Reado wrote — what the CLI is for,
  why the browser extension can't serve here, how to set it up, how filling works,
  and what Reado does with your password once it has it.
- **A page holding a password is off limits to the agent.** While any password field
  in the page has something in it, the agent's commands are refused rather than
  filtered — the refusal surfaces as a request you can allow for that page, and the
  permission lapses as soon as the page navigates. Anything Reado filled from the
  vault is redacted from what the agent reads: the `.reado/` mirror, every command
  result, "send to agent". Your own inspector keeps showing the real page.
- **Open in your browser.** The browser pane's toolbar can hand the current page to
  your real browser — where your password manager's extension lives, since the
  in-app pane is a system webview and can't load browser extensions.

### Fixed
- **Undo works in the editor again.** ⌘Z was being taken by the native Edit menu
  before the editor ever saw it: a predefined Undo item carries the accelerator and
  asks the system's undo manager, which knows nothing about the editor's own
  history — so the keystroke did nothing at all. Undo and Redo are now Reado's own
  menu items without accelerators, so the key reaches the editor, and the menu
  entries still work. Cut, copy and paste stay predefined, because those the editor
  really does receive.
- **The address bar goes where you ask.** A bare host now gets `https://` (`http://`
  when it looks like a dev server — loopback, a `.local`/`.test` name, or an explicit
  port), and anything that isn't an address searches the web instead of silently
  failing. macOS App Transport Security no longer blocks the pane from loading a
  plain-`http://` dev server reached by name (an `/etc/hosts` alias, a LAN IP).
- **Agent navigation follows you.** Navigating the pane yourself allowlists that
  origin for the agent, so a local server behind an `/etc/hosts` alias stops
  answering "origin not allowed"; `*.localhost`, `::1`, `0.0.0.0` and the whole
  `127.0.0.0/8` range count as loopback.

## [1.12.0] — 2026-09-07

### Added
- **An extension marketplace, backed by Open VSX.** Search it from the Extensions
  panel and install colour themes, file icon themes, snippets, language
  configuration and TextMate grammars. Reado reads what an extension *declares*
  and never loads its code — which is why the list only ever shows extensions
  that will actually work here. An extension that also ships code installs its
  declarative half and says, in a sentence, what won't work.
  - Themes map onto Reado's semantic palette, with the built-in theme of the same
    polarity underneath supplying anything the theme leaves out, so an imported
    theme never half-paints the interface. Each one is measured against the same
    WCAG AA contrast floor Reado holds its own themes to, and labelled with the
    result — never blocked.
  - Icon themes drive the file tree, with Reado's own glyphs filling every gap.
  - Snippets are offered in completion for the languages they declare. Completion
    only appears where an extension actually contributes snippets, so nothing
    changes in a project without them.
  - Contributed language configuration teaches comment toggling and auto-closing
    pairs to languages Reado has no pack for.
  - TextMate grammars highlight languages with no CodeMirror language pack. The
    language packs still win where they exist — the outline, focus block and
    syntax-aware selection read their syntax tree, which a token stream can't
    replace. Tokenizing is bounded by a per-line time limit, a line-length cap
    and the visible region, so a pathological grammar degrades to plain text
    instead of freezing the window.
  - Packages are downloaded, checksum-verified and unpacked in the backend, with
    size and entry caps and strict path confinement. Uninstall is exact.
  - Language servers and formatters stay curated: they're the kinds that spawn a
    process, so the command still comes from a compiled allowlist. Both are
    listed in the same panel and one search covers all of it.
  - **Every row opens.** Formatters and language servers get a page too — what
    they add, whether the open project asks for them, what they need, and the
    exact command that installs them. A list where only some rows respond to a
    click reads as broken, not as principled, and the row you reach for first is
    usually one of these.
  - Enable and disable are a button that names what it does, not a checkbox you
    have to read a state off, and a **Reload** prompt appears only after a change
    the open window genuinely can't pick up — a language server is a running
    process, a grammar is compiled into an editor when a file opens. A theme, a
    file-icon set or a formatter changes live and says nothing.
  - Switching an extension off now takes effect immediately rather than at the
    next restart: the hooks that apply a theme and an icon theme filter by the
    enabled list, so they have to watch it.
  - **Every extension has a page.** Click its name and its README opens in the
    editor area, rendered, with Install / Use / Remove alongside it. A sidebar
    row holds a name and two lines of blurb; what decides whether you want an
    extension is what its author wrote about it, and reading that used to mean
    leaving the app. Installed extensions read theirs from disk, so it works
    offline.
  - Switching an extension off now actually stops it contributing — themes,
    icons, snippets, grammars and language configuration all read one filtered
    list, so "disabled" means disabled rather than "still there, quietly". The
    switch appears only once something is installed: offering it on a catalogue
    row was a preference about nothing, and it put a checked box on every line.
  - **If it's installable, it works.** An extension is offered only when Reado
    can deliver everything it contributes; one that also ships code isn't
    listed, however useful the data inside it is. Half an extension with a
    footnote explaining the missing half is an apology, not support. The
    judgement comes from the manifest alone, so an extension published tomorrow
    is classified like one from three years ago and there is no per-extension
    list to keep up to date.
  - The panel opens on what's relevant rather than on a catalogue: a formatter
    the open project declares is a real suggestion, a language server for a
    language you haven't opened is not — it waits behind its own filter, one
    click away. Row actions appear on hover or keyboard focus, so a long list
    reads as a list.
  - Removing an extension asks first, in the row, and the question is
    dismissable — a destructive action was one stray click away.
  - The extension you just updated stays where it was in the list. Replacing it
    meant filtering it out and appending, so the one row you were looking at was
    the one row that moved.
  - **Extensions can be updated.** Installed extensions are read from disk, so
    nothing on the machine knew a newer version existed; the panel now asks the
    registry once when it opens and offers **Update to X** on any row that has
    one, next to Remove rather than in place of it. An extension the registry
    can't answer for offers nothing — unreachable and up-to-date must not look
    the same.
  - Installing a language server or a formatter now opens the terminal it runs
    in. Reusing an already-open pane left the panel closed, so the command ran
    out of sight and the button looked dead. The row stops saying "Install" on
    its own once the tool lands, instead of waiting for a manual re-check.
  - Every section folds away and remembers it, the filter narrows what's on
    screen rather than only what a search asks for, and searching unfolds
    whatever it matched — a hit hidden inside a folded section is a search that
    answered nothing. **Installed** means installed: extensions, formatters and
    language servers alike, with a **Use** control on anything selectable, so
    installing a theme isn't followed by a trip to Settings to see it.
- **Formatters are manifests, with a per-project override.** The Extensions panel
  shows each formatter, whether the open project declares it, and how to declare
  it if you want it. When detection isn't what you want, pin a formatter for a
  file type in that project — or turn formatting off for it — without affecting
  any other project.
- **Format on save.** A new editor setting, off by default, next to the existing
  trim-whitespace and final-newline toggles. It runs the project's formatter
  before writing, and a formatter that fails, hangs, or is missing never blocks
  the save — Reado writes what you have and tells you why it couldn't format.
- **Formatting goes through the language server when one offers it.** rustfmt via
  rust-analyzer, gofmt via gopls, RuboCop via ruby-lsp — each with the project's
  own configuration, which a command-line invocation can only approximate. Reado
  falls back to the project's formatter binary when the server can't format.

### Fixed
- **A globally installed formatter no longer hijacks projects that don't use it.**
  Reado picked formatters from a hardcoded table that fell back to whatever was
  on your PATH, so one Biome install silently reformatted every Prettier project
  you opened — the whole file, in the wrong style. A formatter now runs only when
  the project declares it: a config file it owns, or its name in the project's
  package manifest. Languages with a single conventional formatter (rustfmt,
  gofmt, shfmt) are unchanged.
- **Format Document says what happened.** "This project declares no formatter"
  and "already formatted" used to look identical to doing nothing at all.
- **Formatting no longer throws away your cursor.** It rewrote the whole document
  even to fix one line; now it replaces only what actually changed.
- **File ▸ Save applies the same on-save settings as ⌘S.** The native menu's save
  skipped the trim-whitespace and final-newline toggles entirely.
- **Dropdown options that mean "none" can be chosen again.** Picking an installed
  icon theme left no way back to Reado's own icons, and the same went for the
  default code font and the automatic formatter override — the shared select
  tested the new value for truthiness, so the empty string those options carry
  was read as no selection at all and discarded.

### Changed
- **Imported themes are corrected, not just measured.** A theme supplies its
  identity — canvas, ink, accent, syntax palette — and Reado derives the parts
  that carry legibility from it: surfaces and borders step away from the canvas
  by a fixed perceptual amount in the canvas's own hue, and secondary text is
  solved for a contrast ratio. Copying `descriptionForeground` and
  `editorLineNumber.foreground` onto Reado's tokens imported the names and lost
  the roles — those are colours meant to recede in the editor they were written
  for, and Reado reads them. Themes whose sidebar and editor share one
  background used to leave inputs on the same colour as the page, with an
  invisible border. Ink, accent and syntax colours that fall under WCAG AA are
  now lifted until they clear it, keeping their hue.
- **Settings can be put back.** A **Reset to defaults** in the settings footer,
  behind a confirmation. Every control there was reversible only if you
  remembered what it used to be, which after an evening of moving the font size,
  the line height and the theme around nobody does. Answers you have already
  given are kept — a dismissed prompt stays dismissed rather than coming back.
- **One theme grid, and it tells you when it isn't in charge.** Settings showed
  a separate light and dark picker while following the system, so choosing a
  theme there changed a stored value and nothing on screen. There is now a
  single grid showing the theme you are actually looking at; picking one takes
  over from the system, and a line under it says so when the system is still
  deciding.
- **Secondary text separates from tertiary without either falling below AA.**
  Section labels and hints had drifted close enough to read as one rank; the
  muted rank was lifted rather than the faint rank lowered, so the hierarchy is
  visible and the quietest text still clears 4.9:1. Every theme also carries an
  explicit "ok" colour, so installed and valid states stop borrowing a syntax
  colour that a theme is free to redefine.
- **Settings became a window instead of a drawer**, with a search that takes you
  to a setting by name, every control inside a named group, and section titles
  that no longer look identical to the field labels under them.
- The window's content security policy now allows WebAssembly (`wasm-unsafe-eval`
  in `script-src`). The TextMate grammar engine is a WebAssembly module, and
  Chromium-based webviews refuse to instantiate one without it. It's loaded on
  demand — a session that never opens a file needing a contributed grammar never
  loads it.

## [1.11.0] — 2026-09-04

### Added
- **The agent tells Reado when it's done, instead of Reado guessing.** A new
  `session_done` MCP tool: the agent calls it as the last thing in a turn —
  finished, blocked or failed — and Reado raises the notification and the
  completion chime then. Agents launched from Reado are told to do this in
  their system prompt (where the CLI has a flag for it; Claude Code today), and
  every MCP client also gets the rule through the server's own instructions.

### Fixed
- **The window no longer grinds to a halt while an agent works.** Two causes, both
  measured on a live session: the terminal repainted a decoration (and a marker)
  for every clickable `path:line` in the viewport on *every* xterm render — 210 of
  them for 20 streamed lines — which retained about 7KB of web-process memory per
  line of agent output; it now paints once the output settles. And re-indexing one
  changed file for semantic search ran on the UI thread with an fsync per indexed
  line, plus a symbol walk of the whole project per file, so every file the agent
  wrote froze the window for a second or more; it is now one transaction, this
  file's symbols only, and off the main thread.
- **A dev server in the project no longer locks the window up.** The watcher read
  the root `.gitignore` only, while the file tree walks with the `ignore` crate
  and honours one at any depth — so in a monorepo that keeps its rules in
  `app/.gitignore`, Vite rewriting `app/node_modules/.vite/deps` reached the UI as
  a thousand `file-changed` events (95% of every event in a two-hour session),
  each one a re-anchor, a re-index and a `git status` on the main thread. Nested
  ignore files are now honoured, `node_modules` is ignored outright, and
  collecting the ignore rules moved off the UI thread with the rest of the watcher
  setup.
- **`git status` and the repo info no longer run on the UI thread**, where they
  were 40 of the 130 seconds a locked-up session spent inside blocking commands —
  the Source Control panel polls both every 4 seconds. Reado's git reads also pass
  `--no-optional-locks` now, so a background poll can't take `index.lock` out from
  under the git you are running in the terminal.
- **Language servers now start in a project whose path contains a dot.** The
  connection id doubles as a Tauri event name, which accepts only
  `[A-Za-z0-9-/:_]`: under a path like `~/code/pi.frontend-app` the subscription
  threw *after* the server had spawned, so every language server was started,
  never listened to, and respawned every few seconds — no diagnostics, no hovers,
  and an unhandled rejection each round.
- **Reado no longer edits `.mcp.json` every time you open the project.** Wiring
  the MCP server in is meant to be idempotent, but the "already correct" check
  compared the file's *text* against a fresh re-serialisation: a config a
  formatter had written as `"args": ["mcp"]` never matched, so every open
  rewrote it — a modified file in `git status` and a failing format check.
  It now compares the parsed config and hands an unchanged file back untouched.
- **A missing file no longer shows up in the log as an error.** Half the app
  probes for optional `.reado/*` sidecars a project may not have, and each probe
  was traced at `error` naming no file (the IPC trace logs argument keys, never
  values) — pages of alarms nobody could act on, hiding the real ones. Those
  traces moved to `debug`, and `read_file` now records *which* path was missing.
- **"Play a sound when the agent finishes" now does that.** It was wired to the
  open-task count dropping, so running the agent in the terminal — the ordinary
  case — never made a sound. It now fires on the agent's own end-of-turn
  handoff. The chime also resumes its audio context, which a browser starts
  suspended when no user gesture preceded it.

## [1.10.0] — 2026-09-04

### Fixed

- **A reply that fails to save stays in the box, and says so.** The reply
  handler awaited the write but caught nothing: on a failure the promise
  rejected into nowhere, so the only copy of what you typed was gone with no
  message. It now keeps the draft and surfaces the error.
- **The status bar no longer claims a sibling project's file.** It carried a
  private copy of `toRelative` that had lost the trailing-separator guard, so
  with a project at `~/proj` open, a file from `~/proj-backup` rendered as
  `-backup/…`. It now calls the shared helper, which also learned to handle a
  Windows root (its guard only ever appended a forward slash).
- The command palette now closes after running a command that means to close it.
  `commandRows` is a module-level function, so its `close()` calls were silently
  resolving to the DOM global instead of the store action — sixteen commands ran
  correctly but left the palette sitting open on top of the result.
- **A new file opens as a green diff, not an error.** Clicking a file from
  Source Control that isn't in the base yet — anything added since HEAD — said
  "not present in the selected base" and showed nothing. A file the base doesn't
  have isn't a missing base: it's a file whose every line is added. It now opens
  as an all-added diff. Only a base that genuinely doesn't resolve (no repo, no
  commits, a deleted branch) still says so.

### Added
- **A swatch beside every colour in the file.** Open anything with colours in it
  — a theme file, a palette, a stylesheet — and each `#hex`, `rgb()`, `hsl()` or
  `oklch()` gets a small square painted with that colour. Click it for a picker,
  and the value is rewritten in place **in the notation it was already written
  in**: an `oklch()` token comes back as `oklch()`, never converted to hex. A
  translucent colour shows the chequerboard through it. Off via Settings ›
  Editor if you'd rather not have them.

- **A lot more tests.** Coverage went from 41% to 93% of statements and 94% of
  lines (2274 tests, up from 864; the Rust suite went from 146 to 161);
  branches are at 84% and functions at 89%. The suite was then audited against
  itself — every claim checked by breaking the code it covers and confirming the
  test goes red — which is how the four fixes above were found. New suites cover
  the whole Tauri command boundary (every wrapper's command id and argument mapping), the file
  tree and its drag-to-move, the dock, the terminal and its panel, the browser
  preview and its inspector, the editor and its code view, the workspace shell,
  the app root, the command palette and every command it offers, the knowledge
  graph, the PDF viewer, the onboarding tour, the Review Guide (sources, PR
  submission and the session view), every Settings control, the language server
  driven over a real CodeMirror LSP client, the app-menu dispatcher, the
  in-editor search panel, git blame — and the library modules: reading progress,
  filesystem undo, the agent launcher, MCP wiring, per-project settings, Claude
  Code theme sync, window routing, the extension manifests, the logger, the
  reasoning feed, the auto-updater, drag-to-reorder, the editor's document
  commands and the global keyboard and mouse shortcuts.

### Changed
- The Git tab's "commit with AI" no longer asks the agent to sign the commit:
  the prompt now tells it not to add a `Co-Authored-By` trailer, so the commit
  is attributed to whoever pressed the button.
- **CI runs only what a change can break.** Every job is now gated on the paths
  it covers: a docs- or markdown-only pull request runs a single cheap
  path-filter job and nothing else, a frontend change skips the three Rust jobs,
  and a Rust change skips lint, typecheck and the three-OS frontend matrix.
  Skipped jobs still report to branch protection, so the required checks stay
  green without waiting on a full build to prove a typo fix is safe.
- **Coverage is reported on the pull request.** The Linux frontend job measures
  it and posts a sticky comment with the totals and the changed files. It stays
  a report, not a gate — there is still no threshold that can fail the build.

## [1.9.0] — 2026-09-03

### Added
- **A colour-vision setting.** Roughly 8% of men can't reliably tell red from
  green, and the diff — the surface a review tool is built around — said "added"
  in green and "removed" in red with nothing else to separate them. Settings →
  Appearance now takes which pairs you can't distinguish (red–green, or
  blue–yellow) and recolours the places where a hue is the whole signal: the
  diff, and errors versus warnings. It layers over your theme rather than
  replacing it, so sepia and a readable diff are not a choice between two things.
- **The diff says `+` and `−`.** A non-colour cue helps every kind of colour
  blindness at once and survives a greyscale screenshot, so it is on for
  everyone, not behind the setting. The markers aren't part of the copied text.
- **The window's shape is in the title bar.** Three toggles for the regions
  people hide most — primary sidebar, panel, secondary sidebar — each drawn as
  the window with that region's edge filled, and each showing whether its region
  is on screen. Beside them a Layout menu lists every region with its state and
  the key that toggles it, plus **which side the primary sidebar sits on**. The
  layout was always adjustable; it was just spread across two shortcuts and a
  Settings tab, with nothing on screen saying so. These drive the same settings
  Settings does, so the two never disagree. Hiding a dock keeps its panels — the
  terminal is still there when you bring it back. The controls sit at the
  trailing edge of the strip, where an editor puts them; the leading edge belongs
  to the window's own buttons.
- **A key for the secondary sidebar.** `⌥⌘B` (`Alt+Ctrl+B`), alongside `⌘B` for
  the primary one — the right-hand dock had no binding at all.
- **Panel alignment.** The bottom panel can run under the editor only (the
  default), out to either edge of the workbench, or the full width. The two docks
  are grid regions of their own now rather than children of the editor column,
  which is what makes anything but "center" expressible at all.
- **Centered layout.** Holds the text to a readable measure on a wide display and
  gives the slack back as margin.
- **Zen mode**, on `⌥⌘Z` (`Ctrl+Alt+Z`). One switch that puts the chrome away and
  centres what is left. It records what it hid and replays it on the way out, so
  leaving zen returns the window you had rather than a default one. Not VS Code's
  `⌘K Z`: `⌘K` is Reado's command palette and opens on the first key, so the
  second would land in its input.
- **Full screen**, on `⌃⌘F` and `F11`.
- **Quick input position.** The command palette can sit centred in the window
  instead of pinned near the top.
- **A wider command bar.** The pill is the search field and the strip around it
  was empty.
- **One key cap.** The bordered chip that names a shortcut is a `Kbd` atom now,
  so the layout menu and the palette show a combo the same way instead of each
  drawing its own.
- **Letter spacing for the code surface.** Wider spacing between characters is
  the one typographic change with direct evidence behind it for dyslexic
  readers — [Zorzi et al. (PNAS 2012)](https://www.pnas.org/doi/10.1073/pnas.1205566109)
  found the benefit is specifically larger for them, not a general legibility
  effect. Settings → Appearance, alongside font size and line height, applying
  to every view that renders code. 0 is the standard rendering, so nothing moves
  unless you ask.
- **Name any font you have.** A custom-font field beside the presets, so a face
  that suits you isn't limited to our list.

### Fixed
- **The panel and secondary-sidebar toggles do something.** A dock area's
  visibility and its panels' own open/closed flags were two switches in two
  stores, and the toggles flipped only the first — so pressing one revealed an
  empty region and then reported itself *active*, because "not hidden" was being
  read as "on screen". They now open what lives in the region on the way in, and
  light up only when something is actually there.
- **Hiding the panel keeps the terminal.** Hiding a dock region unmounted it, and
  a terminal kills its shell on unmount — so putting the panel away threw away
  whatever was running in it, and brought back a fresh prompt. A hidden region
  steps out of the layout instead of leaving the page, so the shell you left is
  the shell you get back.
- **`⌘J` works when the panel is hidden.** Hiding the panel and toggling the
  terminal were two switches that could disagree: the terminal would open into a
  region nothing was drawing, so the key did nothing. Opening the terminal now
  reveals the dock it lives in.
- **The pending-commit count is on the Sync button.** It was a bare number
  between four icon buttons, which read as a fifth, dead icon. It is a badge on
  the button it belongs to; the tooltip still spells out the split (`↓2 ↑1`).
- **The Layout menu has a background.** It named a colour that isn't in the
  theme, so it rendered transparent over whatever was behind it.
- **A file from Source Control opens as its diff, in one click.** Clicking a
  changed file means "show me what changed" — that is what it does in every
  other git client — but it took two clicks to get there. Opening the file and
  asking for the diff were two separate writes, and the editor's own "a newly
  opened file starts in the plain view" reset landed in between and wiped the
  request; the second click worked only because the file was already open, so
  the reset didn't fire. The view is now part of the open, so there is nothing
  to race.

- **The commit box looks like every other field.** Source Control's message box
  and its new-branch input used the borderless "filled" surface meant for a
  field sitting inside an already-bordered container — on the panel background
  they read as text on a slab rather than as fields, and neither showed anything
  when focused. They use the same bordered field the rest of the app does, and
  the filled variant now shows a focus ring wherever it is still used.
- **The commit buttons are the shared buttons.** They were hand-styled markup
  re-deriving what the Button atom already does, down to a different focus ring
  from every other button in the app.

- **The diff follows your theme.** The merge view was unstyled, so it rendered
  `@codemirror/merge`'s own hardcoded green and red on every theme — the one
  surface in Reado that ignored the palette, and the worst possible pair for
  red-green colour blindness. It uses Reado's tokens now.

- **The code font picker actually changes the font now.** It offered six faces
  by name and resolved them against what the OS had installed — but on a clean
  machine only Menlo is there, so five of the six fell through to
  `ui-monospace`, which is exactly where the default landed. Every option
  rendered identically. Geist Mono, JetBrains Mono, Fira Code and IBM Plex Mono
  now ship with the app (latin, regular + bold), and the faces we can't
  redistribute are labelled as the conditional ones they are.


## [1.8.0] — 2026-09-03

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
  **Phones paired before this update must pair again, once** — there was nothing
  persisted to carry across, and from now on a pairing survives restarts.
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

[Unreleased]: https://github.com/WatermelonBros/reado/compare/v1.25.0...HEAD
[1.25.0]: https://github.com/WatermelonBros/reado/compare/v1.24.1...v1.25.0
[1.24.1]: https://github.com/WatermelonBros/reado/compare/v1.24.0...v1.24.1
[1.24.0]: https://github.com/WatermelonBros/reado/compare/v1.23.2...v1.24.0
[1.23.2]: https://github.com/WatermelonBros/reado/compare/v1.23.1...v1.23.2
[1.23.1]: https://github.com/WatermelonBros/reado/compare/v1.23.0...v1.23.1
[1.23.0]: https://github.com/WatermelonBros/reado/compare/v1.22.0...v1.23.0
[1.22.0]: https://github.com/WatermelonBros/reado/compare/v1.21.0...v1.22.0
[1.21.0]: https://github.com/WatermelonBros/reado/compare/v1.20.0...v1.21.0
[1.20.0]: https://github.com/WatermelonBros/reado/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/WatermelonBros/reado/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/WatermelonBros/reado/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/WatermelonBros/reado/compare/v1.16.1...v1.17.0
[1.16.1]: https://github.com/WatermelonBros/reado/compare/v1.16.0...v1.16.1
[1.16.0]: https://github.com/WatermelonBros/reado/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/WatermelonBros/reado/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/WatermelonBros/reado/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/WatermelonBros/reado/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/WatermelonBros/reado/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/WatermelonBros/reado/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/WatermelonBros/reado/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/WatermelonBros/reado/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/WatermelonBros/reado/compare/v1.7.2...v1.8.0
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
