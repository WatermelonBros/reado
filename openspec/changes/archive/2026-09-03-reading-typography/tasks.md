# Tasks — Reading typography

## 1. Store (`src/lib/store.ts`)

- [x] 1.1 Add `letterSpacing` (em, default 0 — today's rendering) with the same
      clamping the other reading numerics use.
- [x] 1.2 `codeFont` keeps its preset values; a custom face is just a different
      string, so no new field is needed.

## 1b. Bundled faces

- [x] 1b.1 Add the open-licensed presets as Fontsource packages (latin, 400 +
      700) and import them once at the app entry, so a preset renders on a
      machine that has nothing installed.
- [x] 1b.2 Add **Geist Mono** to the preset list; keep the system faces, and
      make it clear which is which.

## 2. Editor surfaces

- [x] 2.1 Apply `letterSpacing` as a CSS variable alongside the existing font
      size / line height vars, so every CodeMirror surface (editor, diff,
      conflict view, PR view) inherits it from one place.
- [x] 2.2 Verify the gutters (line numbers, blame, bookmarks, diff marks) stay
      aligned with the text at non-zero spacing.

## 3. Settings UI

- [x] 3.1 Letter-spacing control in the Appearance tab, beside font size and
      line height, with a hint naming what it is for.
- [x] 3.2 Custom-font field: free text, committed on blur, sitting under the
      preset picker. An empty field means "use the preset".

## 4. i18n

- [x] 4.1 Labels and hints (EN + IT) for both controls.

## 5. Tests

- [x] 5.1 Store: clamping and defaults.
- [x] 5.1b Every bundled preset is one the app actually ships — a preset that
      resolves to nothing is the bug this change exists to fix.
- [x] 5.2 The CSS variable reaches the editor surfaces; a custom font name wins
      over the preset.

## 6. Verify

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
