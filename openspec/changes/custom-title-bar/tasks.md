## 1. Window config (Rust / tauri.conf.json)

- [x] 1.1 macOS: `titleBarStyle: "Overlay"` in `tauri.conf.json` (transparent bar,
      native traffic lights, content underneath). New windows pass the same option.
- [x] 1.2 Windows/Linux: native decorations dropped from window creation via
      platform config overrides (`tauri.windows.conf.json` / `tauri.linux.conf.json`,
      `decorations: false`) — a borderless window from the start, which makes the
      drag region reliable on Windows. `setDecorations(false)` stays as a runtime
      fallback; new windows pass `decorations: false`.
- [x] 1.3 Capability: minimize / maximize / unmaximize / toggle-maximize / close /
      start-dragging / is-maximized / set-decorations added to `default.json`.

## 2. TitleBar component

- [x] 2.1 Themed strip (OKLCH tokens via `--bg`/`--line`/`--surface`), full-width,
      fixed height; `data-tauri-drag-region` with interactive zones excluded.
- [x] 2.2 Platform-aware left inset: traffic-light gap on macOS; app glyph + menu
      affordance on Win/Linux.
- [x] 2.3 Window controls (Win/Linux): minimize, maximize/restore (live state via
      `onResized`), close. Double-click on the center drag region toggles maximize
      (Tauri's drag handler). The center container is the drag handle so the window
      is movable even though the menu bar + controls fill the sides.
- [x] 2.4 Mounted above the app layout in `App.tsx` (flex column); content sits in
      a `flex-1` region so nothing hides under the strip.

## 3. Command Center

- [x] 3.1 Centered pill showing the project name (or "Reado" on the launcher);
      click opens the command palette.
- [x] 3.2 ⌘K / Ctrl+K already opens the palette (alongside ⌘P) — `SHORTCUTS`.

## 4. Menu access (Windows/Linux)

- [x] 4.1 The Win/Linux app glyph opens the command palette (commands mode) as the
      menu affordance, since `decorations:false` removes the native menu strip.
      macOS keeps its system menu bar. (A fully rendered menu mirror is out of
      scope; the palette exposes the same actions.)

## 5. Verify

- [ ] 5.1 Drag, maximize, controls work on Win/Linux; traffic lights work on mac.
      — macOS testable now; Win/Linux needs a machine.
- [ ] 5.2 Title bar follows the theme on all platforms (no default bar). — macOS
      confirmed via Overlay + themed strip; verify on Win/Linux.
- [ ] 5.3 Nothing overlaps the strip; palette opens from the pill and the shortcut.
      — needs a runtime click-through on macOS.
- [x] 5.4 typecheck + cargo check + vite build green.
