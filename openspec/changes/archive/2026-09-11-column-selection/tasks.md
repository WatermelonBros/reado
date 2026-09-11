## 1. The mode

- [x] 1.1 `columnSelection: boolean` in the settings store (persisted, default off).
- [x] 1.2 `rectangularSelection({ eventFilter })` reading the setting per event —
      no modifier when the mode is on, `altKey` either way. Per event rather than
      through a compartment: nothing to reconfigure, and it applies to files that
      are already open.
- [x] 1.3 Palette command + keybinding (⇧⌥⌘C) + status-bar indicator that toggles
      it, all going through the one setting.

## 2. Keyboard rectangles

- [x] 2.1 Bind ⇧⌥⌘↑/↓ to `addCursorVertical` (Reado already had it, unbound) and
      ⇧⌥⌘←/→ to `selectCharLeft`/`Right`, which extend every range.
- [x] 2.2 Bound unconditionally: a keyboard rectangle does not need the mode.

## 3. Verify

- [x] 3.1 Unit test: the event filter accepts a plain drag only in column mode and
      an Alt-drag always (the cursor-per-line command already had its own).
- [x] 3.2 i18n EN + IT (+ the locales this release adds).
- [x] 3.3 CHANGELOG entry under `[Unreleased]`.
