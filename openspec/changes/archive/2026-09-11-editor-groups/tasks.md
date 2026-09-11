## 1. The model

- [x] 1.1 Groups in `useProject`: an ordered list, each `{ id, tabs, active,
      navStack, navIndex }`, plus the focused id. The existing single/split
      fields become the one- and two-group cases, so nothing in use is lost.
- [x] 1.2 `open` targets the focused group; `close` removes the group when its
      last tab goes, keeping at least one.
- [x] 1.3 Session save/restore carries the groups.

## 2. UI

- [x] 2.1 Render N panes in a row, each with its own `Tabs` and `Editor`.
- [x] 2.2 Click to focus; a focused-group cue that is visible without shouting.
- [x] 2.3 ⌘1…⌘9 to focus; split makes a new group to the right.

## 3. Verify

- [x] 3.1 Unit tests on the reducers: split, focus, per-group history, closing
      the last tab of a group, never fewer than one group, restore.
- [x] 3.2 UI tests: tabs are per group, opening lands in the focused one.
- [x] 3.3 i18n for every shipped locale.
- [x] 3.4 CHANGELOG entry under `[Unreleased]`.
