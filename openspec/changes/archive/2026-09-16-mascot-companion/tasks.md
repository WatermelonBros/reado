## 1. Assets

- [x] 1.1 Build the atlases from the twelve keyed frames in `~/Desktop/reado-mascot`:
      one WebP per state (`idle`, `talk`, `think`, `done`, `ask`), every frame cut
      with the *shared* union crop so the body stays anchored.
- [x] 1.2 A build script that regenerates them from the source PNGs, so a redrawn
      frame does not mean redoing the montage by hand.
- [x] 1.3 Check the sheets at 100/140/200px on both themes before committing them.

## 2. The agent verb

- [x] 2.1 `core::mark_mascot_say(root, text, mood, ttl)` writing `.reado/mascot.json`,
      whole-file like `mark_session_done`, with the timestamp that makes two
      identical sayings distinguishable.
- [x] 2.2 Bound `text`, reject (never silently truncate) over-length or empty.
      *No rate limit yet: an agent in a loop can still talk over itself. The
      bubble already drops all but the newest, so the cost is churn, not noise.*
- [x] 2.3 MCP tool `mascot_say` + one instruction line saying what it is for and,
      more importantly, what it is not for.
- [x] 2.4 `watcher.rs`: `is_mascot_say` → emit `mascot-say`.

## 3. The window

- [x] 3.1 `src-tauri/src/mascot.rs`: create the webview on the `#mascot` route —
      transparent, undecorated, always on top, not focusable, skip taskbar.
- [x] 3.2 Click-through by default; poll the OS cursor and clear
      `ignore_cursor_events` only while the pointer is over the character or its
      bubble. (The window gets no pointer events while ignoring them, so hover
      cannot be detected from inside it.)
- [x] 3.3 Any of the four corners, persisted, parked against the *work area* so a
      corner is a corner and not a spot under the menu bar. The corner is one
      value and everything positional derives from it.
      *Not per display: one setting, applied to the screen the main window is on.*
- [x] 3.4 Secondary click sends it away. A tab on the character tucks it off the
      edge of the screen, leaving a bar to bring it back.
      *No drag: where it sits is the corner setting, deliberately.*
- [x] 3.5 Settings: show/hide, corner, size. Hiding never touches the agent.

## 4. The state machine

- [x] 4.1 `src/lib/mascot.ts`: the five states and their priority; working entered
      on dispatch or a reasoning line, left at the handoff.
- [x] 4.2 Feed it from the *coalesced* handoff in `notify.ts`, so the companion and
      the notification can never disagree.
- [x] 4.3 Test-run state from `useTesting` (running → working, verdict → done/failed).
- [x] 4.4 One bubble at a time, newest wins, bounded lifetime, plain text only.
- [x] 4.5 Reduced motion: one frame per state, bubble unchanged.

## 5. The view

- [x] 5.1 `MascotWindow.tsx`: atlas by state, cell by timer, `background-position`.
      Loops: `talk` and `think` cycle; `done` and `ask` play once and hold.
- [x] 5.2 The bubble: HTML/CSS in the character's palette (cream, ink outline),
      plain text, truncated with the whole text on click, dismissed on click or
      timeout. Which way it opens comes from the corner the user parked the
      companion in — all four are supported, none is assumed.
- [x] 5.3 Bubble and tail as ONE svg path, so the ink outline runs unbroken around
      both. (A CSS-triangle tail cannot: its borders meet the bubble's border at a
      visible seam.) The tail points at the beak and follows when the bubble flips
      side.
- [x] 5.4 Size the window once for character + longest bubble; never resize per
      bubble, and reserve the bubble's side from the click-through region only
      while one is up.
- [x] 5.5 Click raises Reado.
      *It does not yet focus the pane that handed back, or the failing test.*

## 6. Proving it

- [x] 6.1 Unit: state priority, the coalescing agreeing with `notify.ts`, the
      newest-bubble-wins rule, `mascot_say` refusing empty and over-length text.
- [x] 6.2 The atlas cut is shared by construction: the frames are stored already
      cropped to one box, and `mascot-atlas.py` refuses a frame of another size.
- [x] 6.3 By hand with the UI driver: writing `.reado/mascot.json` moved the
      companion end to end — watcher, main window, broadcast, bubble.
