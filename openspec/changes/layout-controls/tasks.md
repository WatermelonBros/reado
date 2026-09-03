# Tasks — Layout controls

## 1. Sidebar side (`src/lib/store.ts`, `ProjectView.tsx`)

- [ ] 1.1 Add `sidebarSide` ("left" | "right", default "left").
- [ ] 1.2 `ProjectView` lays the grid out from it: activity bar + sidebar move
      to the other edge together (they are one edge), the editor keeps the
      middle. The resize handle follows to the sidebar's inner border.

## 2. Secondary sidebar visibility

- [ ] 2.1 The right dock needs an explicit hide that survives a reopen, distinct
      from "no panel is placed there".

## 3. Title bar (`TitleBar.tsx`)

- [ ] 3.1 Three toggles — primary sidebar, panel, secondary sidebar — with
      `aria-pressed` reflecting state, placed so they don't fight the traffic
      lights on macOS or the menu bar on Windows/Linux.
- [ ] 3.2 A layout popover (Ark UI, per the project's component rule): activity
      bar, status bar, breadcrumbs, sidebar side.
- [ ] 3.3 Widen the command pill.
- [ ] 3.4 Keep the drag region working: the strip must still be grabbable.

## 4. i18n

- [ ] 4.1 Labels for every toggle and the popover (EN + IT).

## 5. Tests

- [ ] 5.1 Each toggle flips the store it owns, and reflects state.
- [ ] 5.2 The popover's controls drive the same settings the Settings tab does.
- [ ] 5.3 `sidebarSide` puts the sidebar on the chosen edge.

## 6. Verify

- [ ] 6.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; the title bar
      still drags, and the toggles agree with Settings both ways.
