## Why

Reado is read-first for *code*, but understanding and building a frontend also
means seeing it **render** and poking at it. Today that means leaving Reado for a
browser + DevTools, and when the terminal agent (Claude Code / Codex) helps with
UI work it drives an *external* browser, blind to Reado.

An in-app browser pane — a live preview of the user's running frontend — keeps
the loop in one place. Exposing that pane to the agent over the existing
`reado mcp` bridge lets the agent see and drive **the same view the user sees**:
layout debugging, design passes, animation inspection. It stays true to Reado's
thesis — explicit triggers, honest state, opt-in, project-confined.

Honest constraint that shapes the whole design: the agent perceives **frames +
structured DOM per turn, not a continuous video**. So the target is not "the
model watches a live stream" (not achievable) but "a fresh frame on demand +
auto-capture after each action + deterministic animation scrub" — which is what
actually serves debugging, and is better than eyeballing for timing-sensitive
work.

## What Changes

- **Preview pane (desktop app).** A Tauri child webview that loads a user-set URL
  (typically a local dev server, e.g. `localhost:5173`), with a URL bar, reload,
  and back/forward. Opened explicitly, alongside the code — chrome recedes.
- **Browser-control surface for the agent**, exposed by extending the existing
  `reado mcp` server. Tools to **perceive** (capture frame, read DOM / computed
  styles / accessibility snapshot, read console, inspect + scrub animations) and
  to **drive** (navigate, click, scroll, hover, type). Functional only while a
  Reado desktop instance with the pane is running.
- **Perception model.** On-demand frame **plus** auto-capture after each action,
  a filmstrip/scrub tool for animations, and live structured state (DOM, computed
  styles, console) read at request time. No pretence of live video.
- **Desktop ↔ agent IPC.** The desktop app runs a local control channel that the
  `reado mcp` process proxies to; the browser tools report themselves unavailable
  (honest state) when no desktop pane is up.
- **Opt-in & confined.** Off by default, explicit enable (like `mcp-server`). The
  agent drives the pane's current / user-permitted URL, not arbitrary external
  navigation; control is **in-webview event synthesis only**, never OS-level input.
- i18n EN + IT.

## Capabilities

### Added Capabilities

- `browser-preview`: an in-app browser pane that renders a user-set URL with
  navigation controls, opened on an explicit trigger.

### Modified Capabilities

- `mcp-server`: gains an **opt-in, desktop-bound browser-control** tool group —
  perceive (frame / DOM / console / animation) and drive (navigate / click /
  scroll / hover / type) the preview pane — available only while a Reado desktop
  pane is running, in-webview synthesis only, no external-navigation by default.
