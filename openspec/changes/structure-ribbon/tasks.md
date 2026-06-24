## 1. Data sources

- [x] 1.1 Marks from the heuristic symbol extractor (`extractSymbols`), comment
      anchors (the file's comments), and diagnostics (`useDiagnostics.byFile`),
      combined per line with a kind (symbol/comment/error/warn).

## 2. Ribbon component

- [x] 2.1 `StructureRibbon` (slim right-edge column) renders marks by line ratio,
      colored by kind via the OKLCH tokens; purely presentational.

## 3. Navigation

- [x] 3.1 Click a mark → `scrollIntoView` the line in the editor.
- [x] 3.2 A viewport band (top/height %) shows the visible range, recomputed on
      scroll (the editor already re-renders on scroll).

## 4. Presentation & toggle

- [x] 4.1 Calm, low-contrast marks + a translucent viewport band.
- [x] 4.2 Toggleable: `settings.showRibbon` (default off), via the View menu and a
      command-palette toggle.
- [x] 4.3 Explicitly a structural map, NOT a pixel minimap.

## 5. Verify

- [x] 5.1 EN + IT (`editor.ribbon`); typecheck + cargo check + build green.
