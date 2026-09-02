## Why

The native OS title bar is dead space and OS-owned: it can't follow Reado's
theme (the white-bar-on-Windows report), can't host anything, and looks
"default". Drawing our own title bar reclaims that strip for a **Command Center**
(a centered search/command pill, like VS Code), makes the chrome match the theme
on every platform, and lifts the whole app to the Awwwards-level bar.

## Design (per platform)

A custom title strip rendered by the app, themed with the OKLCH tokens, a drag
region for moving the window, with interactive zones excluded from dragging.

- **macOS** — `titleBarStyle: Overlay`: the window keeps the **native traffic
  lights** (drawing fake ones is an anti-pattern), the bar goes transparent, and
  our content fills the rest. The system menu bar (top of screen) is untouched.
- **Windows / Linux** — `decorations: false`: we draw our own **minimize /
  maximize / close** controls on the right. Removing decorations also removes the
  native menu strip, so the title bar hosts a **menu affordance** (a compact
  rendered menu or a hamburger) — the macOS system menu stays as-is.

## Layout of the strip

- Left: traffic-light inset (macOS) / app glyph + menu (Win/Linux).
- Center: the **Command Center** pill — shows the project name / "Search…", and
  on click (or ⌘K) opens the existing command palette (commands / files /
  search). It is a visible, always-there entry point to functionality Reado
  already has.
- Right: window controls (Win/Linux); optional quick actions.
- The strip is a drag region except for the pill, buttons, and menu.

## What Changes

- `tauri.conf.json`: macOS `titleBarStyle: Overlay`; Win/Linux `decorations:
  false`. Add the window-controls capability.
- A `TitleBar` component: themed strip, drag region, platform-aware insets, the
  Command Center pill, and (Win/Linux) min/max/close + menu affordance.
- The chrome follows the active theme automatically (resolves the Windows
  light-title-bar issue without the OS theme hack).
- Window controls call Tauri window APIs (minimize / toggle-maximize / close);
  double-clicking the strip toggles maximize on Win/Linux.

## Capabilities

### Added Capabilities
- `window-chrome`: a custom, themed title bar with a Command Center and
  platform-correct window controls and drag behaviour.

## Out of Scope
- Tabs-in-title-bar, custom traffic lights on macOS, per-window menu
  customization. Minimap/Problems/Output remain tracked elsewhere.
