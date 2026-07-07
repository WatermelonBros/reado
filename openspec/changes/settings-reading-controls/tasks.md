# Tasks — Phase 1: Reading & editor controls

## 1. Store (`src/lib/store.ts`)

- [x] 1.1 Add fields to `SettingsState` with documented defaults:
      `fontSize` (13; 10–24), `lineHeight` (1.65; 1.2–2.2),
      `lineNumbers` ("on"), `activeLine` ("line"), `indentGuides` ("active"),
      `bracketMatching` (true).
- [x] 1.2 `persist` version bump (→2) with a `migrate` that normalises the numeric
      fields on rehydrate.
- [x] 1.3 `clampRange` helper + `FONT_SIZE_RANGE`/`LINE_HEIGHT_RANGE`; clamp
      `fontSize`/`lineHeight` on read (Editor selectors) so a corrupted value never
      reaches the editor.

## 2. Editor wiring (`src/components/organisms/Editor.tsx`, `src/lib/codemirror.ts`)

- [x] 2.1 Font size + line height applied via `--code-font-size` /
      `--code-line-height` CSS vars on the editor host (no remount; scroll,
      selection, undo preserved). Theme reads `var(--code-font-size, …)`.
- [x] 2.2 Line numbers: `lineNumbersComp` switching off / absolute / relative
      (relative formats distance from the caret line).
- [x] 2.3 Active line: `activeLineComp` combining `highlightActiveLine` /
      `highlightActiveLineGutter` per the four modes.
- [x] 2.4 Indent guides: `indentGuidesComp` toggling the bundled markers
      (all vs active-only vs off).
- [x] 2.5 Bracket matching: `bracketComp` toggling `bracketMatching()`.
- [x] 2.6 Reused existing `wrap`/`whitespace`/`focus` compartments; live
      reconfigure effects added for each new compartment.

## 3. Settings UI (`src/components/organisms/Settings.tsx`)

- [x] 3.1 Editor tab: font size + line height (`NumberField`), line numbers /
      active line / indent guides (`Select`), auto-save, and a "Reading aids"
      section grouping the toggles (reading width, wrap, sticky scroll, render
      whitespace, bracket matching, focus mode).
- [x] 3.2 `NumberField`: free typing, clamp-and-commit on blur/Enter.
- [x] 3.3 Enum controls via `Select` with the documented options.

## 4. i18n (`src/i18n/locales/{en,it}.json`)

- [x] 4.1 Labels/hints/options for every new control (reused `editor.wrap/sticky/
      focus/measure`).

## 5. Cross-cutting

- [x] 5.1 Added the new keys to the settings-sync bundle allow-list.
- [x] 5.2 New fields live in the persisted `reado.settings` slice → cross-window
      sync via the existing `storage` event.

## 6. Verify

- [x] 6.1 Unit test for the clamp logic (out-of-range → bound; non-finite →
      default) in `store.uitest.ts`.
- [x] 6.2 Manual: each control applies live without losing editor state, persists
      across restart, and stays in sync with the View menu (in the running app).
