## Why

Phase 1 filled out the Editor tab. Phase 2 does the same for the **interface**
and the **review workflow** — the two areas that make Reado feel calm and make
its comment/review loop pleasant to live in.

As in Phase 1, part of the work is simply **surfacing state Reado already has**.
The store already persists `zoom`, `showActivityBar`, `showStatusBar`,
`showBreadcrumbs`, `showRibbon`, and `fileIcons`, all applied live today but only
reachable from the View menu (or, for zoom, keyboard shortcuts). Gathering them
into an "Interface" tab makes the app's chrome configurable in one obvious place
and gives the previously near-empty Files tab a real purpose.

The rest are **new, cheap, on-brand controls**: motion, cursor, scrollbar, and
tab-strip options that let a reader quiet the interface, plus two controls that
serve Reado's core loop — hiding resolved comments and suppressing inline
diagnostic squiggles — so the reading surface stays clean during a review.

Still frontend-only: every control is a persisted settings value applied to the
editor or the app chrome. No backend, no new Tauri commands.

## What Changes

- **Rename the "Files" tab to "Interface"** and populate it by surfacing existing
  store fields (no new state): interface zoom (`zoom`), show activity bar
  (`showActivityBar`), show status bar (`showStatusBar`), show breadcrumbs
  (`showBreadcrumbs`), structure ribbon (`showRibbon`), file type icons
  (`fileIcons`, moved here from the old Files tab).
- **Add interface controls** to `useSettings` and wire them:
  - `reduceMotion` (`system | on | off`) — damp UI animations/transitions;
    `system` follows the OS `prefers-reduced-motion`.
  - `tabBar` (`multiple | single | hidden`) — editor tab-strip density.
  - `scrollbar` (`auto | always | hidden`) — editor scrollbar visibility.
  - `cursorStyle` (`line | block | underline`) — caret shape.
  - `cursorBlink` (`blink | smooth | solid`) — caret blink behaviour.
- **Add review-workflow controls**:
  - `showResolvedComments` (boolean) — whether resolved comment threads remain
    visible in the gutter/panel or are hidden to declutter.
  - `inlineDiagnostics` (boolean) — whether diagnostic squiggles/underlines are
    drawn in the editor (the Problems panel and tree counts are unaffected).
- **Interface zoom as a discrete control**: a `Select` of preset levels (e.g.
  90 / 100 / 110 / 125 / 150%) writing the existing numeric `zoom`, staying
  consistent with the existing zoom-in/out shortcuts.
- **Reduce-motion honesty**: when `reduceMotion` resolves to on (explicitly or
  via the OS), Reado suppresses non-essential animations app-wide, including the
  sliding segmented-control thumb and drawer/overlay transitions.
- **Cross-window + portability**: all new fields join the persisted
  `reado.settings` slice and the settings-sync allow-list.
- **i18n**: `en.json` + `it.json` copy, including the new "Interface" tab label.

Out of scope: anything needing the backend (Phase 3). This change assumes Phase 1
has landed (shared Settings layout, eyebrow sections).

## Capabilities

### Added Capabilities

- **settings-interface** — an Interface tab gathering the app-chrome controls
  (zoom, activity/status bar, breadcrumbs, ribbon, file icons) plus new motion,
  cursor, scrollbar, and tab-strip options, each persisted and applied live.
- **settings-review** — reading-surface controls for the review loop: hide
  resolved comments and suppress inline diagnostics, without affecting the
  underlying comment/diagnostic data.
