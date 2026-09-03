# Tasks — Colour vision

## 1. Make the diff Reado's

- [x] 1.1 `--diff-add` / `--diff-del` (and their soft backgrounds) in every
      theme, dark and light.
- [x] 1.2 Style `@codemirror/merge`'s classes from those tokens, replacing its
      hardcoded `#22bb22` / `#ee4433`, which follow no theme at all.

## 2. Non-colour cue

- [x] 2.1 `+` / `−` on inserted and deleted lines in the diff, so the
      distinction survives colour blindness, greyscale and a screenshot.
- [x] 2.2 Keep it out of the copied text: a marker is chrome, not content.

## 3. The setting

- [x] 3.1 `colorVision` in the store: `"normal" | "red-green" | "blue-yellow"`.
- [x] 3.2 Apply it as a root attribute beside the theme, so it layers rather
      than replaces.
- [x] 3.3 Token overrides per mode: diff pair, and error vs warning. They live
      in `lib/colorVision.ts` rather than the stylesheet — unlike a theme, a
      colour-vision palette makes a claim ("this pair is off the axis") that the
      tests can check, and applying it as inline custom properties is what makes
      it layer over the theme instead of replacing it.

## 4. Settings UI

- [x] 4.1 A control in Appearance, labelled by what the reader cannot separate
      rather than by the clinical name alone.

## 5. i18n

- [x] 5.1 Labels and a hint (EN + IT).

## 6. Tests

- [x] 6.1 Every theme defines the diff tokens; no mode leaves one undefined.
- [x] 6.2 In a red–green mode the add/remove pair is not a red/green pair.
- [x] 6.3 The mode composes with the theme instead of overriding it.

## 7. Verify

- [x] 7.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
