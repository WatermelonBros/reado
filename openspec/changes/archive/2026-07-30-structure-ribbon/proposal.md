## Why

Reading an unfamiliar file means first grasping its *shape*: where the functions
and classes sit, where the comment artifacts (the unit) are anchored, and where
the diagnostics cluster. Scrolling blindly to find these is slow, and a pixel
minimap — the usual answer — is the opposite of read-first: it is dense, noisy,
and rewards skimming pixels rather than understanding structure. Reado needs a
calm, structural alternative: a slim vertical ribbon beside the scrollbar that
marks structural anchors so the reader sees the file's skeleton at a glance and
navigates by clicking, with the comment↔AI loop reinforced by surfacing comment
anchors right where the reader is orienting.

## What Changes

- **Structure Ribbon component** (`src/components/StructureRibbon.tsx`): a slim
  vertical column rendered beside the editor scrollbar for the active file.
- **Structural marks**: positions of functions/classes from document symbols
  (reuse the Outline/LSP `documentSymbols` source in `src/lib/lsp.ts`), comment
  anchors (from the durable comment store), and diagnostics (LSP severities),
  each as a calm, low-contrast mark mapped to its line.
- **Navigation**: click a mark or ribbon position to scroll the editor there;
  hover shows a quiet tooltip (symbol name / comment / diagnostic message). A
  viewport indicator tracks the currently visible range and follows scrolling.
- **Calm presentation**: muted theme tokens only (`text-faint`/`border-line`,
  `accent` reserved for the viewport indicator), no pixel rendering of text.
- **Toggle**: a setting/command to show or hide the ribbon (Command Center +
  persisted preference; off does not reserve layout space).
- **i18n**: EN+IT strings for the toggle label and tooltips
  (`src/i18n/locales/en.json|it.json`).

## Capabilities

### Added Capabilities
- `structure-ribbon`: a slim vertical structural overview of the active file
  (symbols, comment anchors, diagnostics) for at-a-glance shape and click-to-jump.

## Out of Scope

- A pixel minimap or any rendering of scaled-down text/pixels — explicitly NOT
  read-first and not part of this capability.
- Cross-file or project-wide overviews; the ribbon is per active file.
- Drag-to-scrub editing gestures beyond click/hover navigation.
- Changing how symbols, comments, or diagnostics are produced — the ribbon only
  consumes existing sources.
