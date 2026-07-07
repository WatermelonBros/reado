## Why

Reado's Settings drawer exposes a thin slice of what the app can already do. Two
gaps compound each other:

1. **Hidden existing preferences.** The `useSettings` store already persists
   `wrap`, `stickyScroll`, `renderWhitespace`, and `focusMode` — real, wired
   behaviours toggled today only from the native View menu. A user browsing
   Settings can't discover or change them there.
2. **Missing reading knobs.** Reado is a read-first IDE, yet the two levers that
   most shape reading comfort after the font family — **font size** and **line
   height** — aren't adjustable at all, and there's no control over line
   numbers, active-line emphasis, indent guides, or bracket matching. VS Code
   users reach for these constantly.

This is Phase 1 of a three-phase Settings expansion. It stays deliberately
**frontend-only**: every control here is a value in the persisted settings store
applied to the CodeMirror editor or the reading surface — no new backend, no new
Tauri commands, no filesystem or git access. Phases 2 (interface & review) and 3
(backend-dependent) follow as separate changes.

It also completes the calm, well-spaced Settings redesign already underway
(tabbed sidebar, uppercase section headers, aligned gutters) by giving the
Editor tab enough real content to justify its weight.

## What Changes

- **Surface four existing store fields** in the Settings UI (no new state):
  word wrap (`wrap`), sticky scroll (`stickyScroll`), render whitespace
  (`renderWhitespace`), focus mode (`focusMode`). Each already applies live via
  its CodeMirror compartment; Settings becomes a second, discoverable trigger
  alongside the View menu, staying in lock-step with it.
- **Add reading/editor controls** to `useSettings` and wire them to the editor:
  - `fontSize` (number, px) — editor text size, clamped to a sane range.
  - `lineHeight` (number, unitless multiplier) — editor leading, clamped.
  - `lineNumbers` (`off | on | relative`) — gutter line numbers.
  - `activeLine` (`off | gutter | line | both`) — active-line emphasis.
  - `indentGuides` (`off | all | active`) — indentation markers (reuses the
    already-bundled `@replit/codemirror-indentation-markers`).
  - `bracketMatching` (boolean) — highlight the matching bracket at the cursor
    (CodeMirror built-in).
- **Editor tab layout**: group the above under the Editor tab with the existing
  code font, auto-save, and reading-width controls, using the shared eyebrow
  section pattern.
- **Bounds & validation**: numeric settings are clamped to documented ranges on
  read and on write, so a corrupted or hand-edited persisted value can never
  produce an unreadable editor.
- **Cross-window + portability**: new fields live in the same persisted
  `reado.settings` slice, so they sync across open windows via the existing
  `storage` event and are carried by the settings-sync bundle's allow-list.
- **i18n**: labels/hints/option strings added to `en.json` and `it.json`.

Out of scope (later phases): interface chrome toggles and cursor/scrollbar/tab
options (Phase 2), review-workflow toggles (Phase 2), and anything needing the
backend — file-exclude globs, git gutter signals, save-hygiene, large-file
handling, telemetry (Phase 3).

## Capabilities

### Added Capabilities

- **settings-editor-controls** — discoverable, persisted, live-applied editor
  and reading controls in the Settings UI, covering both the newly surfaced
  existing fields and the new font-size/line-height/line-number/active-line/
  indent-guide/bracket controls, with clamped numeric bounds and cross-window
  consistency.
