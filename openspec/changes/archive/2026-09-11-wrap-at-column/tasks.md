## 1. The setting

- [x] 1.1 `wrapColumn: number` in the settings store, default `0` ("window edge"),
      clamped to 0…400 by the field that writes it.
- [x] 1.2 Settings → Editor: a number field beside the wrap toggle, disabled while
      wrap is off, with a hint saying `0` means the window edge.
- [x] 1.3 i18n EN + IT (+ the locales this release adds).

## 2. The editor

- [x] 2.1 `wrapExtension(wrap, column)`: `EditorView.lineWrapping` plus, when a
      column is set, a theme capping the content measure at `Nch` and keeping the
      gutter out of the measure.
- [x] 2.2 Drive it from the existing `wrapComp` compartment so a change applies to
      an already-open file, in both panes.

## 3. Verify

- [x] 3.1 Unit test: the extension is empty with wrap off, plain wrapping at
      column 0, and carries the measure at column 120; the clamp rejects 5 and
      9999.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
