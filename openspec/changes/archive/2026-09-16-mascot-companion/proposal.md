## Why

Reado knows when the agent stops working. `session_done` writes `.reado/done.json`,
the watcher fires, and the desktop rings once — and that is the whole of it. Three
things are wrong with that being the whole of it:

- **A notification is a moment, not a state.** It fires once and is gone. Nothing
  on screen answers "is it still working, or is it waiting for me?" — the one
  question a user who walked away comes back with.
- **The ring only reaches a user who is looking at their desk.** When Reado's
  window is behind a browser, or the agent runs in iTerm on the same project,
  Reado has the fact and no surface to put it on.
- **The fact is richer than the ring.** `blocked` and `done` and `failed` all
  produce the same chime, and the agent's one-line summary is thrown away after
  the notification is dismissed.

The failure mode of this idea is well documented and has a name: an assistant
that speaks on a guess, on a timer, about something it does not know. This
proposal is written to make that impossible rather than unlikely — the companion
shows only facts Reado already holds, and says only what an agent explicitly told
it to say.

## What Changes

- **A companion window.** A second Tauri webview — frameless, transparent,
  always on top, never focusable, click-through everywhere except the character —
  parked in a corner of the screen. It renders Reado's mascot from a sprite atlas,
  and its speech bubble is live text drawn by the companion — in the character's
  own palette, so the two read as one object over whatever is underneath.
- **The mascot's state is the agent's state**, resolved from signals Reado
  already owns: a dispatch or a `reado thought` line means working; `.reado/done.json`
  means the turn was handed back, with `done` / `blocked` / `failed` each getting
  their own face; a test run's verdict colours the result.
- **One new agent verb: `mascot_say`.** An MCP tool writing `.reado/mascot.json`,
  watched exactly like `done.json` and `reasoning.jsonl`. This is the only way
  for words to reach the bubble, which is what keeps the bubble honest.
- **Nothing new in the transport.** Files under `.reado/` plus the existing
  watcher, which is why an agent running *outside* Reado — in any terminal, on
  the same project — drives the companion with no hooks installed anywhere.

## Capabilities

### Added Capabilities

- `mascot-companion`: the window, the states, the bubble, and the agent verb that
  fills it.

## Impact

- `crates/reado-cli/src/mcp.rs`: the `mascot_say` tool + its instruction line.
- `crates/reado-core/src/lib.rs`: `mark_mascot_say`, mirroring `mark_session_done`.
- `src-tauri/src/watcher.rs`: `is_mascot_say` → a `mascot-say` event.
- `src-tauri/src/mascot.rs` (new): create/show/hide/move the companion window,
  and the cursor poll that toggles click-through over the character.
- `src/components/pages/MascotWindow.tsx` (new) + a `#mascot` route.
- `src/lib/mascot.ts` (new): the state machine and the bubble queue.
- `src/lib/notify.ts`: the coalesced handoff feeds the companion as well as the
  notification, so both agree and neither double-fires.
- `src/assets/mascot/*.webp`: the atlases.
- Settings: show the companion, which corner, size.
