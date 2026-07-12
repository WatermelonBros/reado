> Build order follows the phases in design.md: a working menu-driven layout (1–2)
> ships "move any panel anywhere" first; drag-and-drop and splits (3–4) add the
> fluid experience; folding the old toggles (5) closes it out.

## Status — v1 (local, not yet released)

Shipped: the layout **model** (`src/lib/layout.ts`, areas/groups/tabs/move/split/
resize/reset — pure reducers, unit tested) and a **`DockRegion`** rendering the
`right` and `bottom` areas from it. The **terminal and browser** are dockable:
side-by-side or stacked, resizable (area + inter-group splitters), moved via a
per-group **⋯ menu** (Dock right / Dock bottom / Stack) and **drag-and-drop** (drag
a dock tab onto a strip to stack, onto a body to split). Persisted and reset. The
default arrangement matches today (browser right, terminal bottom), so nothing
regresses. The browser's native window follows its placeholder and hides during a
drag/menu so DOM drop targets stay visible.

Deferred (noted for a follow-up, to tune interactively): tool panels as dockable
(they stay on the activity bar); the `left` area; DnD drop-**indicators**;
per-project persistence (v1 persists one global arrangement); no-reload panel
reparent on a cross-area move (the browser reloads when moved between areas).

## 1. Layout model + render (menu-driven)

- [x] 1.1 A layout store: `areas: {left,right,bottom}` → ordered **groups** →
      tabbed **panels** (`PanelId`), each with a size weight; the editor is the
      fixed centre. Actions: move panel to area, add/close panel, set active tab.
- [x] 1.2 Render `ProjectView` from the model: dock areas around the editor, each
      area rendering its groups (tabbed) at their weights; empty areas collapse.
- [x] 1.3 Panel tab menu: **Move to Left / Right / Bottom**, **Close** (no DnD yet).
- [ ] 1.4 Register the existing panels as dockable: tool panels (files/search/…),
      terminal, browser preview.

## 2. Persistence + reset

- [x] 2.1 Persist the layout per project (`.reado/layout.json`); restore on open
      and after reload.
- [x] 2.2 "Reset layout" action returns to the default arrangement.

## 3. Drag-and-drop

- [x] 3.1 Drag a panel tab; show live **drop zones** on areas/groups and a drop
      **indicator** previewing tab-vs-split; drop applies the move. Reuse the
      existing pointer-drag pattern (no new dependency).

## 4. Split within an area

- [x] 4.1 Dropping beside a group **splits** the area into side-by-side groups;
      inter-group **splitters** resize; menu gains **Split right / down**.
- [x] 4.2 Verify "browser beside terminal" in the bottom area works end-to-end.

## 5. Fold in existing toggles + content-survival

- [ ] 5.1 Migrate defaults from today's layout; supersede `useTerminals.position`
      and `usePreview.inspectorPos` (seed the initial dock, then the model owns it).
- [x] 5.2 Reparent panels without tearing down content: terminal keeps its PTY +
      scrollback; the browser child window follows its placeholder (reuse the
      ResizeObserver + window move/resize listeners) with no page reload.
- [x] 5.3 Zoom-correct on every layout change; per-window layout.

## 6. Verify

- [ ] 6.1 Move each panel to each area via menu; reopen project → layout restored;
      reset → default.
- [ ] 6.2 Drag a panel to tab-stack and to split; browser beside terminal renders
      and stays aligned; terminal keeps its session; browser doesn't reload.
- [ ] 6.3 Correct under interface zoom; frontend typecheck + build green; EN + IT.
