## 1. Data sources

- [ ] 1.1 Collect structural marks for the active file: function/class positions
      from `documentSymbols` (`src/lib/lsp.ts`), comment anchors from the comment
      store, diagnostics with severity from LSP.
- [ ] 1.2 Normalise each mark to a `{ line, kind, label, severity? }` shape and
      map line → vertical fraction of the file.
- [ ] 1.3 Keep marks reactive: refresh on symbol/diagnostic/comment changes and
      on active-file switch; debounce to avoid churn.

## 2. Ribbon component

- [ ] 2.1 Add `src/components/StructureRibbon.tsx`: a slim vertical column
      rendered beside the editor scrollbar for the active file.
- [ ] 2.2 Render calm, low-contrast marks per kind (symbol / comment / diagnostic)
      using muted theme tokens; no pixel/text rendering.
- [ ] 2.3 Add a viewport indicator band that reflects the currently visible line
      range and follows scrolling.

## 3. Navigation

- [ ] 3.1 Click a mark or a ribbon position to scroll the editor to that line.
- [ ] 3.2 Hover shows a quiet tooltip with the symbol name / comment text /
      diagnostic message; keyboard-accessible focus equivalents.

## 4. Toggle and presentation

- [ ] 4.1 Add a show/hide toggle (Command Center command + persisted preference);
      when off, the ribbon reserves no layout space.
- [ ] 4.2 Verify WCAG AA contrast for marks, tooltip, and viewport indicator.
- [ ] 4.3 Add EN+IT strings for the toggle label and tooltips in
      `src/i18n/locales/en.json|it.json`.

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green
