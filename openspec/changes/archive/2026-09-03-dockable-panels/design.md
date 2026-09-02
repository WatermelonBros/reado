# Design — dockable panels

## Today

`ProjectView` is a CSS grid: `[activity bar] [tool sidebar] [main]`. `main` is a
flex column: an editor row (editor + optional split editor + browser-right +
terminal-right) and a terminal-bottom below it. Panels carry ad-hoc position
state: `useTerminals.position` and `usePreview.inspectorPos` each toggle
bottom↔right; the browser is hard-wired to the editor row's right. There is no
shared layout model, so panels can't co-locate or move beyond their one toggle.

## Model

One **layout tree** replaces the ad-hoc positions. The editor is the fixed
**centre**; around it sit three dock **areas**: `left`, `right`, `bottom`.

- **Area** = an ordered list of **groups** laid along the cross-axis, each with a
  size weight. (Left/right areas split their groups vertically; the bottom area
  splits horizontally — so "browser beside terminal" is two groups in `bottom`.)
- **Group** = a **tabbed stack** of panels + an active tab + a size weight.
- **Panel** = one dockable unit, referenced by a stable `PanelId`
  (`tool:files`, `tool:search`, …, `terminal`, `browser`). A panel appears in
  exactly one group. The browser's inspector is a nested area *inside* the browser
  panel (its own bottom/right sub-dock — already built), not a top-level panel.

```
layout = {
  areas: {
    left:   { groups: [ { tabs: ['tool:files','tool:search'], active, size } ], size },
    right:  { groups: [...], size },
    bottom: { groups: [ {tabs:['terminal'],size}, {tabs:['browser'],size} ], size },
  }
}
```

This zone+group+split model covers the asks (co-locate, tab, split, resize)
without a fully-recursive grid — simpler to build and reason about, and it maps
cleanly onto the current regions for migration.

## Interactions

- **Drag** a panel tab. While dragging, dock **drop zones** light up: onto a
  group's tab-strip → join as a tab; onto a group's edge → split a new group
  beside it; onto an empty area → move there. A drop indicator previews the result.
- **Menu/keyboard** parity: each panel tab has "Move to → Left / Right / Bottom",
  "Split right/down", and "Close". So the feature is usable without drag (a11y).
- **Resize**: drag any area edge or inter-group splitter; weights persist.
- **Empty areas** collapse to zero width/height (no dead space).

## The panels

- **Tool panels** (files/search/comments/outline/…): today one-at-a-time via the
  activity bar. Under the model they become dockable panels; the activity bar
  stays as the quick **switcher/opener** (clicking a tool reveals or focuses its
  panel wherever it's docked). Multiple tool panels can now be open at once.
- **Terminal**: a PTY-backed panel; content survives moves (the xterm/PTY isn't
  torn down — only its container reparents).
- **Browser preview**: its DOM placeholder drives the **native child window**; the
  child follows the placeholder to any dock via the existing screen-coordinate
  `preview_set_bounds`. So docking the browser anywhere is already coordinate-safe.
  Its inspector remains a sub-dock within the browser panel.
- **Editor**: stays the centre for v1 (not a movable panel). Editor **groups** /
  freely-docked editors are out of scope here.

## Constraints & correctness

- **Native browser child window**: reposition on every layout change (reuse the
  ResizeObserver + move/resize listeners already added). No extra work beyond
  ensuring the placeholder is measured wherever it lands.
- **Terminal reparent**: keep the xterm DOM node mounted and move its wrapper, so
  scrollback/PTY survive a dock move (like the terminal already keeps panes
  mounted across group switches).
- **Interface zoom**: layout math stays in the zoom layer's logical px; the child
  window already converts via scale.
- **Multi-window**: the layout is per project window; persisted per project so a
  reopened window restores it.

## Persistence & migration

- Persist the layout tree under the project (`.reado/layout.json`) or the settings
  store; restore on open; "Reset layout" clears it to the default.
- **Migration**: default layout = today's arrangement (tools left, terminal +
  browser bottom/right per their last toggle). `useTerminals.position` and
  `usePreview.inspectorPos` are superseded — their values seed the initial dock on
  first run, then the layout tree owns position.

## Phasing (task order)

1. **Model + render** the layout tree (areas/groups/tabs) with resizing — no DnD;
   panels placed at their migrated defaults; move via the **menu** ("Move to …").
2. **Persistence** + reset.
3. **Drag-and-drop** with drop zones + indicators.
4. **Split within an area** (side-by-side groups) — the "browser beside terminal".
5. Fold the terminal/inspector toggles into the model; polish empty-area collapse.

Shipping 1–2 already delivers "move any panel anywhere" (via menu); 3–4 add the
fluid drag experience.

## Open decisions

1. **Editor as a panel?** Keep the editor a fixed centre (proposed), or make it a
   dockable group too (bigger — enables editor-beside-browser)?
2. **Persistence location**: project-local `.reado/layout.json` vs the global
   settings store (per-project keyed).
3. **Top dock**: include a `top` area, or left/right/bottom only (proposed)?
4. **DnD library**: hand-rolled pointer DnD vs a small dep. (Lean hand-rolled to
   avoid a dependency, reusing the existing pointer-drag resizers.)
