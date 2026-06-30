# 1 — Launcher / Recent Projects

The screen shown when no project is open. Entry: `RecentProjects.tsx`.

**Cases: 27.**

---

### TC-LAUNCH-0001 — Launcher renders with no project
**As a** user, **when I** open Reado with no project, **I expect** the title, an Open-folder action and a Recent Projects list.
- **Result:** PASS

### TC-LAUNCH-0002 — Open-folder action
**As a** user, **when I** click "Apri cartella…", **I expect** the native OS folder picker to open.
- **Result:** MANUAL (native dialog)

### TC-LAUNCH-0003 — Open-folder hint readable
**As a** user, **when I** look at the open-folder action, **I expect** a one-line hint about opening any local folder.
- **Result:** PASS

### TC-LAUNCH-0004 — Recent projects listed
**As a** user, **when I** return to the launcher, **I expect** my recent projects, most-recent first, each showing its path.
- **Result:** PASS

### TC-LAUNCH-0005 — Open a recent project
**As a** user, **when I** click a recent project, **I expect** the workspace to open on it (hash → #project=…).
- **Result:** PASS

### TC-LAUNCH-0006 — Remove-from-list control on hover
**As a** user, **when I** hover a recent row, **I expect** a "Rimuovi dalla lista" button to appear.
- **Result:** PASS

### TC-LAUNCH-0007 — Remove a recent persists
**As a** user, **when I** click "Rimuovi dalla lista", **I expect** the row gone and still gone after reload.
- **Result:** MANUAL

### TC-LAUNCH-0008 — Empty state (no recents)
**As a** user, **when I** open with no recents, **I expect** a sensible empty state, no broken list.
- **Result:** TODO

### TC-LAUNCH-0009 — Update banner when outdated
**As a** user, **when I** open an outdated build, **I expect** an "Aggiornamento disponibile" affordance.
- **Result:** PASS (gone after 0.13.0 bump)

### TC-LAUNCH-0010 — Dismiss update modal
**As a** user, **when I** click "Più tardi", **I expect** the modal to close, app usable.
- **Result:** PASS

### TC-LAUNCH-0011 — Open project mounts cleanly (no rejections)
**As a** user, **when I** open any project, **I expect** no uncaught errors or unhandled rejections.
- **Result:** PASS → BUG-1 fixed (was 7 rejections)

### TC-LAUNCH-0012 — Non-existent recent path
**As a** user, **when I** click a recent whose folder was deleted, **I expect** a graceful error, not a blank workspace or crash.
- **Result:** TODO

### TC-LAUNCH-0013 — Path with unicode / spaces
**As a** user, **when I** open a project whose path has unicode, **I expect** it to open (hash URL-encoded).
- **Result:** TODO

### TC-LAUNCH-0014 — Recents list with 0 entries
**As a** user, **when I** open the launcher with 0 recent projects, **I expect** the list to render correctly and stay scrollable.
- **Pre:** 0 recents in store
- **Result:** TODO

### TC-LAUNCH-0015 — Recents list with 1 entries
**As a** user, **when I** open the launcher with 1 recent projects, **I expect** the list to render correctly and stay scrollable.
- **Pre:** 1 recents in store
- **Result:** TODO

### TC-LAUNCH-0016 — Recents list with 5 entries
**As a** user, **when I** open the launcher with 5 recent projects, **I expect** the list to render correctly and stay scrollable.
- **Pre:** 5 recents in store
- **Result:** TODO

### TC-LAUNCH-0017 — Recents list with 20 entries
**As a** user, **when I** open the launcher with 20 recent projects, **I expect** the list to render correctly and stay scrollable.
- **Pre:** 20 recents in store
- **Result:** TODO

### TC-LAUNCH-0018 — Recents list with 100 entries
**As a** user, **when I** open the launcher with 100 recent projects, **I expect** the list to render correctly and stay scrollable.
- **Pre:** 100 recents in store
- **Result:** TODO

### TC-LAUNCH-0019 — Launcher under reado-dark
**As a** user with a theme set, **when I** view the launcher with the reado-dark theme, **I expect** correct colors, contrast and legibility.
- **Result:** TODO

### TC-LAUNCH-0020 — Launcher under reado-light
**As a** user with a theme set, **when I** view the launcher with the reado-light theme, **I expect** correct colors, contrast and legibility.
- **Result:** TODO

### TC-LAUNCH-0021 — Launcher under reado-sepia
**As a** user with a theme set, **when I** view the launcher with the reado-sepia theme, **I expect** correct colors, contrast and legibility.
- **Result:** TODO

### TC-LAUNCH-0022 — Launcher under reado-high-contrast
**As a** user with a theme set, **when I** view the launcher with the reado-high-contrast theme, **I expect** correct colors, contrast and legibility.
- **Result:** TODO

### TC-LAUNCH-0023 — Launcher at zoom 0.8
**As a** user, **when I** view the launcher at interface zoom 0.8, **I expect** the layout to scale cleanly with no clipping or overflow.
- **Result:** TODO

### TC-LAUNCH-0024 — Launcher at zoom 1.0
**As a** user, **when I** view the launcher at interface zoom 1.0, **I expect** the layout to scale cleanly with no clipping or overflow.
- **Result:** TODO

### TC-LAUNCH-0025 — Launcher at zoom 1.25
**As a** user, **when I** view the launcher at interface zoom 1.25, **I expect** the layout to scale cleanly with no clipping or overflow.
- **Result:** TODO

### TC-LAUNCH-0026 — Launcher at zoom 1.5
**As a** user, **when I** view the launcher at interface zoom 1.5, **I expect** the layout to scale cleanly with no clipping or overflow.
- **Result:** TODO

### TC-LAUNCH-0027 — Launcher at zoom 2.0
**As a** user, **when I** view the launcher at interface zoom 2.0, **I expect** the layout to scale cleanly with no clipping or overflow.
- **Result:** TODO
