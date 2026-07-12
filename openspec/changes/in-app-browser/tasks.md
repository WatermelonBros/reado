> Build order: the preview pane (1–3) is useful on its own. The capture bridge (4)
> feeds both the custom inspector UI (5) and the agent-control surface (6–9). Opt-in
> + confinement (10) and verify (11) close it out.

## 1. Preview pane (desktop)

- [x] 1.1 A Tauri child webview that loads a user-set URL (URL bar, reload,
      back/forward), rendered as a right-hand split at ~half width, opened on an
      explicit action (palette + toolbar), closable.
- [x] 1.2 Isolation: the preview is its own webview, separate from Reado's UI
      document; a previewed page cannot reach app state.
- [x] 1.3 Persist the last preview URL per project under `.reado/`.

## 2. Detach / re-dock

- [x] 2.1 Detach moves the preview surface into a second Tauri `WebviewWindow`;
      re-dock returns it to the right-hand split without a full reload. The loaded
      page/state survives the move.

## 3. Frame capture

- [x] 3.1 Capture the preview webview's surface to an image (PNG/JPEG) on demand.

## 4. Capture bridge (console + network)

- [x] 4.1 Inject a bridge into the preview: override `console.*` and hook
      `window.onerror` + `unhandledrejection` → buffered entries `{level, args
      (serialized), timestamp, source, stack}`.
- [x] 4.2 Wrap `fetch`/`XHR` + add a `PerformanceObserver('resource')` → network
      entries (method, URL, status, headers/payload/body where available, timing),
      failures flagged.
- [x] 4.3 One bridge, three consumers: the entries feed the inspector UI, the
      `browser.*` MCP tools, and "send to agent". Document the network ceiling
      (fetch/XHR + resource timing; not byte-complete for every resource).

## 5. Custom inspector UI (Console + Network)

- [x] 5.1 Console panel on Reado tokens/atoms: leveled entries, level filter, text
      search, object/array expansion, clear, and an **evaluate** input (run an
      expression in the page, show the result). Errors are a first-class filter.
- [x] 5.2 Network panel: request list (method/URL/status/type/size/timing) + a
      per-request detail view (headers, query/payload, response), failures flagged.
- [x] 5.3 Opened from a control on the preview; matches the app's UX exactly.

## 6. Control channel + `browser.*` tools

- [x] 6.1 Desktop app hosts a loopback (`127.0.0.1`) WebSocket control channel
      tied to the running instance.
- [x] 6.2 `reado mcp` gains an **opt-in**, desktop-bound `browser.*` tool group
      that proxies to the channel; `tools/list` hides it until enabled.
- [x] 6.3 Honest unavailability: a browser tool with no running pane returns a
      clear "no preview pane running" error (no hang, no fake success).

## 7. Perception tools

- [x] 7.1 `browser.frame` (capture), auto-frame returned after each drive action.
- [x] 7.2 `browser.dom` / computed styles / accessibility snapshot for queried
      elements.
- [x] 7.3 `browser.console` and `browser.network` read the bridge's entries;
      errors and network failures are queryable on their own.
- [x] 7.4 `browser.animation`: read `getAnimations()` keyframes + computed timing;
      scrub (`pause()` + `currentTime = t`) and capture a frame per stepped time.

## 8. Drive tools

- [x] 8.1 `browser.navigate` (allowlist-checked), `browser.click/scroll/hover/type`
      via in-webview DOM event synthesis (no OS-level input).

## 9. Send error to agent

- [x] 9.1 A one-action "send to agent" on a console error / failed request in the
      inspector delivers its message, level, source, and stack into the terminal
      agent's context (via Reado's existing agent bridge).

## 10. Opt-in, confinement, i18n

- [x] 10.1 Off by default; explicit enable (palette action + `.reado/` setting),
      same shape as `mcp-server`; enabling/disabling is an explicit trigger.
- [x] 10.2 Origin allowlist: `localhost`/`127.0.0.1` always allowed + user-managed
      project allowlist; agent navigation outside it is refused.
- [x] 10.3 i18n EN + IT for all new UI + palette actions.

## 11. Verify

- [ ] 11.1 Pane opens/loads/navigates; detach → second window → re-dock, page state
      intact.
- [ ] 11.2 Inspector: console shows an uncaught error + evaluate works; network
      lists a request with detail and flags a failure.
- [ ] 11.3 With MCP enabled: agent captures a frame, reads DOM, reads console
      errors + network failures, scrubs an animation, drives click/type; "send to
      agent" delivers an error; disallowed-origin navigation refused; tools absent
      when disabled and error cleanly when no pane.
- [x] 11.4 Frontend typecheck + build green; Rust builds; EN + IT complete.
