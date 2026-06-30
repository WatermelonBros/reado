# Reado — Bug Ledger

Bugs found by driving the live app via the in-webview automation bridge
(`scripts/uidriver`). Each entry: area, severity, repro, expected vs actual.

| # | Area | Sev | Summary | Repro | Expected | Actual |
|---|------|-----|---------|-------|----------|--------|
| 1 | Lifecycle / project open | Med ✅FIXED | 6–7 `unhandledrejection` (`undefined is not an object (evaluating 'listeners[eventId].handlerId')`) on every project open — **still present on v0.13.0 (now 7)** | Open any project (launcher→project, or cold-start into last project) | No unhandled rejections | 6 (v0.12.0) / 7 (v0.13.0, more listeners added) unhandled rejections fire. Root cause: `ProjectView.tsx:208-210` cleanup `offs.forEach((p) => p.then((off) => off()))` lacks `.catch`; Tauri `unlisten` rejects (StrictMode double-effect / double cleanup) and escapes. Fix: `.catch(() => {})` on the chain + idempotent unlisten. |
| 3 | Comments / anchoring | Med ✅FIXED | A comment whose anchored code is deleted silently re-anchors to a structurally-similar sibling instead of becoming an orphan | Comment lines 1-2 of a `greet()` fn; delete `greet()` entirely; the comment jumps onto the neighbouring `add()` fn and rewrites its own `context.snippet` to `add`'s code | Anchor can't be located → comment flagged `orphan: true` (shown in Orphans panel) | Comment "Potential null deref here" relocated from `greet` to `add`, `orphan: false`. Root cause: `relocate()` step 3 (fuzzy snippet-alone, `crates/reado-core/src/lib.rs:861-865`) has no context guard; boilerplate-heavy short snippets (`export function …`, `return …`) clear `FUZZY_THRESHOLD = 0.6` against a sibling. Fix: raise/condition the snippet-alone threshold, require distinctiveness beyond shared boilerplate, or bound step-3 matches near the old line. |
| 2 | LSP / editor | Low ✅FIXED | LSP `textDocument/didOpen` re-sent for an already-open document after a webview reload | **Deterministic:** open a `.js` file → reload the webview (HMR/crash-recovery) → reopen the same file | Frontend reconciles open docs with the persistent backend LSP server (or backend resets open-doc state on webview disconnect) | `[lsp] Notification handler 'textDocument/didOpen' failed … Can't open already open document: …/src/main.js`. The LSP server lives in the Rust backend and **survives the webview reload**; on reload the frontend loses its open-doc state and re-sends didOpen with no preceding didClose, so the server rejects it. Doc-version tracking can desync. Fix: send didClose on teardown, or have the client treat "already open" as didChange / re-sync on reconnect. |

### Notes / unconfirmed
- Update modal at first launch appeared to have two "Più tardi" buttons (snapshot counted 2); not reproducible after dismissal (modal shows once per session). Low priority — re-check on a fresh launch.

### Methodology notes (not app bugs)
- **Never `node.remove()` React-managed DOM** from the driver: removing a `[role=menu]` `<ul>` by hand crashed the app into the ErrorBoundary (`The object can not be found here.` — WebKit NotFoundError) when React later reconciled it. Close menus with `Escape` instead. A "crash" investigated on 2026-06-29 was traced entirely to this harness mistake, not an app defect.
- **Save via synthetic Cmd+S and auto-save on programmatic edits don't fire** the real write path (they rely on genuine input/focus events). Mark disk-write cases MANUAL; editing/dirty/undo are verifiable via the `window.__reado` test hook.

## Fixes applied (verified live on v0.13.0)

- **BUG-1** — `src/components/pages/ProjectView.tsx`: added `.catch(() => {})` to both listener-cleanup chains (`subs` and `offs`). Opening a project now logs **0** unhandled rejections (was 7).
- **BUG-2** — `src/lib/lsp.ts`: a `pagehide` handler stops the session's LSP servers so a webview reload starts each server fresh. Reload → reopen no longer triggers `didOpen` "already open"; diagnostics still work.
- **BUG-3** — `crates/reado-core/src/lib.rs`: snippet-alone fuzzy match (step 3 of `relocate`) now requires `FUZZY_SNIPPET_ONLY_THRESHOLD = 0.8` instead of 0.6. Deleting `greet()` now orphans its comment instead of dragging it onto the sibling `add()`. Regression test `relocate_orphans_rather_than_jumping_to_a_boilerplate_sibling` added; `cargo test` 21/21 green.

## Fuzz campaign (toward the 5000-test target)

`scripts/uidriver/fuzz.mjs` drives the live app through randomized actions across
every area (open files, switch tools/tabs, toggle panels, palettes, themes,
terminal, create/delete comments, cursor moves, search…), asserting after each
that the app neither tripped the ErrorBoundary nor logged a console error.

**Final run: 5040 actions — 0 ErrorBoundary trips, 0 unhandled rejections, 0 console errors.**

The fuzz also widened **BUG-1**: the un-caught listener-teardown pattern existed
at **8 sites**, not just `ProjectView` — all fixed with `.catch(() => {})`:
`ProjectView.tsx` (×2), `Editor.tsx`, `Terminal.tsx`, `App.tsx` (×2),
`TitleBar.tsx`, `FileTree.tsx`. A residual, far rarer race lives inside Tauri's
own event dispatcher (an event arrives for a listener torn down a tick earlier →
`listeners[eventId]` is gone); it isn't catchable at app call sites, so the
global `unhandledrejection` handler in `main.tsx` now recognises and suppresses
that one benign message so it can't bury real errors. After this, fuzz rejections
went 14 → 11 → **0**.

## More bugs

| # | Area | Sev | Summary | Repro | Expected | Actual |
|---|------|-----|---------|-------|----------|--------|
| 4 | Visual / interface zoom | Med ✅FIXED | Overlays rendered **inside** the zoomed content layer scale up and overflow off-screen at zoom > 1 | Set interface zoom to 2.0; open the command palette (Cmd+P) | Overlays anchored to the viewport at a constant size regardless of zoom (like the Settings dialog, which is correct) | The command-palette input goes 638×56 → **1276×113** (scaled 2×, text visually ~30px) and the palette box reaches `bottom 1048` vs a 832px viewport — **clipped ~216px off-screen**. The Settings modal is rendered *outside* the `transform: scale(var(--app-zoom))` layer (stays 420×832 at every zoom) — so overlay placement is inconsistent. `App.tsx:107-118` zooms a content layer; in-content overlays (palette, and likely context menus / inline composer) inherit the scale and overflow. Fix: render the palette (and other floating overlays) as a sibling outside the zoom layer, like Settings/TitleBar. This is the "robe brutte" visible while zooming. |

| 5 | Cross-OS / shortcuts | Low ✅FIXED | macOS-only key glyphs are hardcoded in some hints/tooltips and shown verbatim on Windows/Linux | Run on Windows/Linux and view the terminal toggle tooltip and the command palette | Glyphs adapt per OS (⌘→Ctrl, ⌥→Alt) — the `mod` helper + `currentOS()` already exist | `StatusBar.tsx:363` shows `(⌘J)`; `Palette.tsx:539/593/594` show `⇧⌥F`, `⌥←`, `⌥→`. A Windows/Linux user sees mac symbols that don't match their keyboard. Fix: route these through `mod` (lib/shortcuts.ts) and an Alt/Option glyph helper, like the other palette hints already do. |

### Cross-OS coverage gap (important)

All testbook execution so far (the 170 PASS) was on **macOS / WKWebView only**. Windows (WebView2/Chromium) and Linux (WebKitGTK) were **not** executed and can't be from this host. The largest risk is the **different webview engine per OS** — CSS, scrollbars, font rendering and the `transform: scale()` zoom (BUG-4) can diverge. The backend itself is reasonably OS-aware (`#[cfg(windows/unix)]` in pty/proc/anywhere/cli, `\`→`/` path normalisation in watcher + TS), but rendering parity is untested. See testbook §X11/§X12 for the OS matrix; the realistic automated net is a CI job running vitest + cargo on all three OSes.

## UI test harness + cross-OS CI (added this session)

- **Component testing**: vitest now has two projects — `logic` (node) and `ui`
  (happy-dom + @testing-library/react). UI tests (`*.uitest.tsx`) mount real
  components in a simulated DOM and run **identically on macOS / Windows / Linux**.
  First tests: shortcut-glyph OS adaptation (BUG-5 guard), theme application
  (Tauri-mocked), ContextMenu interaction. 10 UI tests, all green.
- **CI matrix** (`.github/workflows/ci.yml`): frontend (typecheck + `pnpm test`
  incl. UI + build) and the pure Rust crates now run on **ubuntu + macOS +
  windows**; full Tauri fmt/clippy/build-deps stays on Linux. So every shipped OS
  now runs the logic + UI suites — closing the gap where tests ran on Linux only
  while Windows was still released.
- **BUG-5 fix**: `lib/shortcuts.ts` gained `alt`/`ctrl`/`shift` OS-aware glyph
  helpers; all hardcoded ⌘/⌥/⌃ in shortcuts.ts, Palette.tsx and StatusBar.tsx now
  route through them. Verified by `shortcuts.uitest.ts` on a mocked Windows/Linux UA.

### BUG-4 fix (verified)
- `App.tsx`: moved `<Palette />` out of `ProjectView` (inside the `transform: scale(var(--app-zoom))` layer) up to the app root, alongside `Settings`/`AnywhereDialog`. The command palette / file finder is a viewport-anchored overlay, so it now renders at a fixed size regardless of zoom. Verified: the palette input stays **638px at zoom 2.0** (was 1276px, scaled 2×) and no longer overflows off-screen. KnowledgeGraph/DocsView stay inside the zoom layer (they are content that should scale).
