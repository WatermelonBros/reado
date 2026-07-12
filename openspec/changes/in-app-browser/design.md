# Design — in-app browser

## Context

Two things are being added that look like one feature:

1. A **preview pane** — value for the *human*: your running frontend, live, next
   to the code. Genuinely real-time for you.
2. **Agent control of that pane** — value for the *loop*: Claude drives and
   perceives the same view for debugging / design / animation work.

They are separable and should ship in that order. (1) is useful alone; (2)
depends on (1) plus the `mcp-server` bridge.

## The honest limit (drives everything)

An LLM perceives **discrete inputs per turn**: images (captured frames) + text
(DOM, console, computed styles). There is no channel where the model *watches* a
continuous stream while it thinks. Even a 60fps screencast is, to the model, the
**latest single frame** at the moment of the turn.

So we do **not** build "the model watches live video". We build the loop that
*feels* live and is actually better for debugging:

- **Fresh frame on demand** + **auto-capture after every action** (click/scroll/
  type → the resulting frame comes back without a separate "screenshot" step).
- **Frame bursts / filmstrip** when motion matters (N frames of an animation as a
  strip).
- **Live structured state** — DOM, computed styles, a11y tree, console — read at
  the instant of the turn; for layout/animation these beat pixels.

For the human, the pane is truly live. For the model, "live" = always-fresh
frame + always-current DOM.

## Architecture

```
 terminal agent ──stdio(JSON-RPC)──▶ reado mcp (CLI process)
                                         │  browser.* tools
                                         ▼
                          local control channel (127.0.0.1, loopback)
                                         │
                                         ▼
                     Reado desktop app  ──eval/inject──▶ preview WebView
                        (owns the pane)  ◀──frame/DOM──
```

- The **preview WebView** lives in the desktop app (Tauri child webview). The app
  owns it: it can `eval` JS in it, capture its surface, and read results back.
- The existing **`reado mcp`** CLI process is where MCP lives (unchanged
  transport). It gains a `browser.*` tool group that **proxies** each call over a
  local loopback channel to the running desktop app. The desktop app performs the
  action on the WebView and returns frame/DOM/console.
- **Honest unavailability**: if no desktop pane is up, `browser.*` tools return a
  clear "no preview pane running" error rather than hanging or faking success.

Why proxy through the desktop app instead of the agent driving its own browser:
the whole point is the agent and the user share the *same* view. The browser has
to be the in-app pane.

## Data-back channel: `eval_with_callback` (CSP-immune)

Getting data *out* of the isolated preview page is done with Tauri 2.11's
`Webview::eval_with_callback(js, |result|)` — native eval that returns the JS
result (JSON-serialized) to Rust. Crucially this is **not a network request**, so
the previewed page's CSP (`connect-src` etc.) can't block it — unlike a WebSocket
or `fetch`-home bridge. So the capture bridge (installed via
`initialization_script`) just **buffers** into `window.__readoBridge`, and Rust
**pulls** it on demand: `preview_eval("window.__readoBridge.drain()")`. The same
primitive backs DOM queries and animation scrubbing. (The loopback WebSocket in
the resolved decisions is for the *agent ↔ app* control proxy, a separate hop; the
*page ↔ app* data path is this eval channel.)

## Perception mechanics (all in-webview, cross-platform)

- **Frame capture**: the app captures the preview WebView's surface → PNG/JPEG
  handed back as an image. Auto-captured after each drive action; also on demand.
- **"Screencast"**: emulated as capture-after-action + capture-on-interval while a
  live mode is on. Not CDP; frames, not a stream.
- **DOM / computed styles / a11y**: inject JS (`querySelector`,
  `getComputedStyle`, box model, `getAnimations()`), return JSON.
- **Console bridge**: inject a console hook that buffers entries; a tool drains
  the buffer. (The pane's own webview console, not the app's.)
- **Animation inspect + scrub** (prototyped, works today via pure JS):
  `el.getAnimations()` → keyframes + `getComputedTiming()` (the *spec*); then
  `anim.pause(); anim.currentTime = t` at stepped `t` + frame capture →
  frame-accurate filmstrip and per-element progress. No CDP needed.

## Custom inspector (Console + Network)

A **custom** inspector, built on Reado's tokens/atoms/Ark — not the webview's
native devtools — so it matches the app. One **capture bridge** (injected into the
preview) feeds three consumers: the inspector UI, the `browser.*` MCP tools, and
"send to agent".

- **Console**: the injected bridge overrides `console.*` and hooks
  `window.onerror` + `unhandledrejection`, buffering entries `{level, args
  (serialized), timestamp, source, stack}`. The UI renders levels, filtering,
  search, object expansion, clear, and an **evaluate** field (`eval` in the page,
  result serialized back). Errors are a first-class filter and the unit that
  "send to agent" / the MCP error query operate on.
- **Network**: injected `fetch`/`XHR` wrappers capture request/response
  (method, URL, status, headers, payload, body, timing); a
  `PerformanceObserver('resource')` adds timings for other resource loads.

**Honest ceiling on Network parity.** Pure JS injection sees **app-initiated
`fetch`/`XHR`** (with headers/bodies) **plus resource timings**. It does *not* see
everything Chrome's Network panel does: response bodies of non-fetch resources,
`Set-Cookie`/other protected headers, and requests fired before the bridge
installs. Full DevTools-grade network needs **CDP** → Windows/WebView2 or an
external Chrome. So the cross-platform target is: all `console.*` + uncaught
errors/rejections (full parity), and `fetch`/`XHR` + resource-timing network with
failures flagged (not byte-complete for every resource). This is called out so we
don't promise Chrome-identical Network on macOS/Linux.

## Input synthesis (fidelity caveat)

Drive actions (click/scroll/hover/type) are **synthesized DOM events injected
into the WebView**, not OS-level input. This works everywhere but is not
byte-identical to real hardware input (no true `:hover` from the OS cursor, no
native drag inertia, trusted-event flags differ). Documented as a known ceiling;
good enough for layout/design/animation debugging, which is the use case.

## Platform matrix

| Capability | macOS (WKWebView) | Windows (WebView2) | Linux (WebKitGTK) |
|---|---|---|---|
| Preview pane | ✅ | ✅ | ✅ |
| Frame capture | ✅ | ✅ | ✅ |
| DOM / console / input synthesis (JS) | ✅ | ✅ | ✅ |
| Animation inspect + scrub (JS) | ✅ | ✅ | ✅ |
| CDP perf trace (dropped frames) | ❌ | ✅ (Chromium) | ❌ |

Everything the feature promises is JS-injection based → **works on all three**.
The only Chrome/CDP-exclusive extra (a performance trace for jank) is a **non-goal**
here; if wanted later it's a separate, Windows-only or external-Chrome path.

## Security & confinement

- **Off by default**; explicit enable, same shape as `mcp-server` (palette action
  + project `.reado/` setting). Enabling/disabling is an explicit trigger.
- **Origin allowlist.** `localhost`/`127.0.0.1` (any port) is always allowed; the
  user maintains a project allowlist of additional origins (e.g. a staging host).
  Agent-initiated navigation is **confined to the allowlist**; a request outside
  it is refused, not silently followed.
- **In-webview synthesis only** — the agent never gets OS-level mouse/keyboard.
- No secrets: the pane is a viewer of a URL the user chose; the control channel is
  loopback-only and tied to the running app.

## Alternatives considered

- **External Chrome + CDP** (what exists today via the browser MCP): richer
  (screencast, perf trace) but it's a *separate* window — the user and agent don't
  share the in-app view, which is the entire premise. Keep it as the "I need a
  perf trace" escape hatch, not the primary path.
- **`<iframe>` instead of a child WebView**: blocked by `X-Frame-Options`/CSP on
  many targets, and cross-origin DOM access is walled off. A native child WebView
  avoids both and allows injection.

## Non-goals

- The model "watching" continuous live video (not achievable — frames only).
- Driving arbitrary external websites / general web automation.
- CDP performance tracing on macOS/Linux.
- OS-level input into the webview.

## Resolved decisions

1. **One change, ordered tasks.** Both the pane and agent control live in this
   change; tasks build the pane first (useful alone), then the control surface.
2. **Placement: right-hand split, detachable.** The preview opens as a pane to the
   **right of the code, ~half width**. A **detach** control pops it out into a
   **second Tauri window** (e.g. onto another monitor) and can re-dock. The same
   preview webview + control channel serve both docked and detached — detaching
   just reparents the surface, it does not spin up a second browser engine to
   drive.

   **Hosting: Tauri multiwebview (`unstable` feature).** Reado's chrome (URL bar,
   the custom Console/Network inspector) and the previewed page must live together
   yet stay separately controllable — so the main window hosts **two webviews**:
   Reado's UI and the preview page, the page positioned in the right region and
   driven via `eval` + a scoped data-back channel. This needs the `tauri` crate's
   `unstable` feature (`window.add_child(WebviewBuilder, pos, size)`). Rejected: a
   bare separate window can't wear Reado's chrome; a cross-origin `<iframe>` to the
   dev server can't be injected/inspected. The `unstable` dependency is contained
   to this subsystem. Detach = move the preview webview into its own window; the
   frontend keeps the page webview's bounds in sync with the pane via a resize
   observer → a `preview_set_bounds` command.
3. **Origin policy: allowlist.** `localhost` always allowed; the user maintains a
   project allowlist for extra origins. Agent navigation is confined to it.
4. **Control channel: file queue** (as built) — `.reado/preview-cmd.json` /
   `preview-result.json`, drained by the pane's existing ~0.7s poll loop. Chosen
   over the loopback WebSocket originally planned: it reuses the poll loop, needs
   no server/port/deps, and the pull-based tools don't need push. (WS remains the
   upgrade path if live push/streaming is ever wanted.)
5. **Live cadence: capture-after-action by default**, with an opt-in low-Hz
   interval while an explicit "live" mode is on.

## Detach & the second window

Docked and detached are the **same** preview: one webview surface and one control
channel. "Detach" moves that surface into a second Tauri `WebviewWindow`; "re-dock"
returns it to the right-hand split. The agent's `browser.*` tools address *the
preview*, not a specific window, so control is unaffected by where it currently
lives. (Mind the existing multi-window LSP caveat only insofar as we do **not**
open a second *project* window — this is a preview surface, not a second editor.)
