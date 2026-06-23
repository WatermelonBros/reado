> Additive: with split off, the terminal behaves exactly as today. The risk is
> keeping PTYs mounted (no respawn) across layout changes — verify scrollback
> survives every operation.

## 1. State model

- [x] 1.1 Add a group layer over the existing flat `sessions` (panes) in `lib/terminals.ts`: `groups: { id, dir: "row"|"column", paneIds: string[], sizes: number[] }[]` + `activeGroupId`; keep `sessions` and `activeId` (focused pane) for backward compatibility with the launch/dialog/git consumers.
- [x] 1.2 `add()` creates a new group with one pane (unchanged "new tab" semantics, returns the pane id).
- [x] 1.3 `split()` adds a pane to the active group, evens the sizes, focuses it.
- [x] 1.4 `remove(paneId)` drops the pane from its group (re-even sizes); removing the last pane removes the group; fix `activeId`/`activeGroupId`.
- [x] 1.5 `setActive(paneId)` focuses a pane and selects its group; `setActiveGroup(id)` focuses the group's first pane.
- [x] 1.6 `setGroupDir(id, dir)` and `setSizes(id, sizes)`.

## 2. Rendering (no PTY respawn)

- [x] 2.1 Keep every pane's `<Terminal>` mounted in one stable container; show only the active group's panes (others hidden) so PTYs/scrollback persist.
- [x] 2.2 Tile the active group's panes via flex (`flexDirection = dir`, `flexGrow = size`, `flexBasis: 0`) using CSS `order` to interleave dividers, so nothing remounts when groups/orientation change.
- [x] 2.3 Per-pane focus affordance (click to focus) and a quiet close control; focused pane visually indicated.

## 3. Resize

- [x] 3.1 Draggable divider between adjacent panes converts pointer delta to a size-weight delta (px / container axis length), clamped to a sensible minimum.
- [x] 3.2 Each `<Terminal>` re-fits on size change (existing ResizeObserver) — confirm rows/cols update without PTY restart.

## 4. Controls & wiring

- [x] 4.1 Header: "Split" button + orientation toggle for the active group; tabs map to groups; "+" creates a new group.
- [x] 4.2 Verify launch / Send review / Audit / git "Commit & push with AI" all target the focused pane (`activeId`).
- [x] 4.3 i18n strings (split, orientation, close pane) in EN + IT.
- [x] 4.4 Responsive header: below a width threshold (esp. right dock narrowed), collapse labeled buttons ("Send review", "Audit") to icon-only with tooltips so nothing clips/wraps.

## 5. Verification

- [ ] 5.1 Scrollback survives: split, resize, toggle orientation, switch tabs, dock bottom↔right — no PTY respawn, no lost output.
- [x] 5.2 Closing panes/groups kills their PTYs (`pty_kill`, process-group kill);
      closing a whole window reaps that window's PTYs in Rust on `CloseRequested`
      (`kill_for_window`) since a webview teardown won't run the React cleanup; ids
      are now per-window-salted so PTYs never cross windows.
- [x] 5.3 typecheck + build green.
