---
name: record-demo
description: Record a video/GIF of the real Reado app doing something (leaving comments, reviews, agent loops) for the README or the website. Drives the dev build through the UI driver with a visible fake cursor and captions, captures only the Reado window with ffmpeg, exports MP4 + GIF to docs/media/. Use when asked to record, film, screen-capture or make a demo/GIF/video of Reado.
---

# Record a Reado demo

Pieces (all in `scripts/demo/`):

| file | role |
|---|---|
| `run.mjs <scenario> [--record]` | runs a scenario against the dev app; with `--record` it also captures and exports |
| `record.sh start\|stop\|export <name>` | ffmpeg capture cropped to the Reado window → `docs/media/<name>.mp4` (≤1920 wide) + `.gif` (960 wide) |
| `demo-kit.js` | injected into the webview: `window.__demo` = fake cursor (`moveTo`, `click`), human-paced `type`, caption pill `say`, `hide` |
| `scenarios/*.mjs` | one clip each: `name`, `setup(app)` (before recording), `default(app)` (the take) |

## Prerequisites (check, don't assume)

1. `ffmpeg` on PATH (`brew install ffmpeg`).
2. Screen Recording permission for the app hosting this session (the terminal / Reado).
   Test: `ffmpeg -f avfoundation -i "Capture screen 0:none" -frames:v 1 /tmp/t.png` must produce an image of the desktop, not black.
3. The **dev build running with the UI driver**, next to the installed app, on a **throwaway fixture project** — never the real repo (scenarios delete comments to get a clean take):
   ```
   bash scripts/bundle-cli.sh && npx tauri dev --config '{"identifier":"com.reado.dev"}' -- -- /path/to/fixture/src/cart.ts
   ```
   Launch it unsandboxed, in the background, from a short command. Wait until the bridge is up
   (`lsof -nP -iTCP:1420 | grep -c com.apple` ≥ 2) before sending anything.
   Fixture: a git repo with `src/cart.ts` (the discount bug from the site's OG image), `src/types.ts`,
   `src/discounts.ts` (`VIP: { percent: 1.2 }`).

## Workflow

1. **Rehearse** without recording: `node scripts/demo/run.mjs scripts/demo/scenarios/<clip>.mjs`.
   Fix selectors until it runs clean end to end.
2. **Record**: `node scripts/demo/run.mjs scripts/demo/scenarios/<clip>.mjs --record`.
   The Reado dev window must stay in front and untouched for the whole take — the capture records the
   screen region, so anything on top of the window ends up in the video. Tell the user before a take.
3. **Look at it** before calling it done:
   `ffmpeg -i docs/media/<name>.mp4 -vf "fps=1/2,scale=800:-2,tile=2x3" -frames:v 1 /tmp/contact.png`, then read the image.

## Writing a scenario

- `app.js(body)` runs a JS body in the webview (`return` a JSON value). **Each call must finish in < 30 s**
  (relay timeout); split long sequences. The kit is prefixed to every call, so a webview reload mid-take
  (Vite does reload on file changes) doesn't lose `window.__demo`.
- Reach app state through `window.__reado` (Zustand stores: `useProject`, `useComments`, `useEditorActions`,
  `useLayout`, `useSettings`, `useDocInfo`…), never `import()` (different module instance after HMR).
- Editor positions: `useDocInfo.getState().view.coordsAtPos(pos)` → viewport coords for `__demo.moveTo({x,y})`.
  Selections: `view.dispatch({ selection: { anchor, head } })`.
- Commands with a shortcut: call the store action and show the shortcut with `__demo.say("⌘⇧M  Comment")`
  (keyboard events don't reach CodeMirror/menus reliably from the driver).
- Buttons: find them by structure or text, then `__demo.click(el)` (it sends pointerdown… for Ark UI).
- Setup for legible footage: English UI (`localStorage["reado.locale"]` → reload), `useSettings.setState({ zoom: 1.35 })`,
  bottom panel hidden (`useLayout.getState().toggleArea("bottom", true)`). These only touch the dev profile.
- Wait for UI by polling (`for (…) await __demo.sleep(50)`), not fixed sleeps: `useProject.open()` is sync and the editor mounts later.

## Output

MP4 for the website (`<video autoplay muted loop playsinline>`), GIF for the README. Both land in
`docs/media/`; the README already embeds `docs/media/reado-loop.gif`.
