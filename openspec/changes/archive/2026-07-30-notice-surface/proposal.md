## Why

Reado already has a transient-notice channel (`useNotice` + `Notice`), but it is
under-used and single-slot: most Tauri calls in `App`/`ProjectView` are
fire-and-forget with a silent `.catch(() => {})`, so when git, the watcher, the
index, a save, or an agent launch fails, the user gets **no feedback at all** —
the app just quietly does nothing. For a tool that asks to be *trustworthy*, a
silent failure is the worst outcome: the reader can't tell "nothing to do" from
"it broke".

A second gap: `useNotice` holds exactly one notice, so a second event instantly
replaces the first — two things failing at once means one is lost.

## What Changes

- **notice-surface** (capability):
  - Turn the single-slot notice into a small **stack** of transient toasts
    (bottom-centre), each auto-dismissing, newest on top, capped so a burst can't
    flood the screen. Manual dismiss per toast.
  - Add a `notifyError(scope, error)` helper in lib code that logs *and* surfaces
    a concise, human message (never a raw error dump), plus a `notify(kind, text)`
    for success/info.
  - Wire the currently-silent failure paths — git operations, the filesystem
    watcher start, index rebuild, file save, agent dispatch — to report through
    it instead of swallowing.
  - Motion: toasts rise/fade in and collapse out with a short, calm transition
    that respects `reduce-motion`.
- **i18n**: `en.json` + `it.json` for the generic failure messages.

Out of scope: a persistent notification centre / history log (the diagnostic log
file already records everything); OS-level notifications (already handled by
`notify.ts` for agent-completion). This is purely the in-app transient surface.

## Capabilities

### Added Capabilities

- **notice-surface** — an app-wide transient toast stack that lib code can drive
  without React context, with a logging error-reporter helper, so operations that
  fail surface a calm, dismissible message instead of failing silently.
