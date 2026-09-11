## 1. The range

- [x] 1.1 A `StateField` holding the active find range (or null), mapped through
      every document change so edits inside it keep it correct.
- [x] 1.2 A decoration marking the range in the editor while it is active.
- [x] 1.3 Effects to set and clear it; clearing on panel close.

## 2. Scoped commands

- [x] 2.1 `findNextIn` / `findPrevIn`: `query.getCursor(state, from, to)` from the
      cursor, wrapping at the range's ends.
- [x] 2.2 `replaceNextIn` / `replaceAllIn`, including `$&` / `$1…$9` expansion for
      a regex query (the library's own expansion is not exported).
- [x] 2.3 The panel's counter counts within the range.
- [x] 2.4 With no range set, every one of them is exactly the library's command.

## 3. The panel

- [x] 3.1 The toggle, with the same look, `aria-pressed` and tooltip as the other
      three.
- [x] 3.2 Opening with a multi-line selection → scope on (decided in the state
      field: a panel is mounted mid-update and cannot dispatch); single-line →
      seed the query, as today.
- [x] 3.3 The panel's buttons and Enter route through the scoped commands.

## 4. Verify

- [x] 4.1 Unit tests: matches outside the range are not found, Replace All leaves
      the rest of the document untouched, the counter counts the range, an edit
      inside the range keeps the range's end correct, and with no range every
      command matches the unscoped one.
- [x] 4.2 i18n EN + IT (+ the locales this release adds).
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
