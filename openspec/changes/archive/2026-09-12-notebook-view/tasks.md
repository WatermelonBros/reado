## 1. Parsing

- [x] 1.1 `parseNotebook`: cells, types, source (string or line array), execution
      counts, ids with an index fallback, and the kernel's language from either
      place it is written.
- [x] 1.2 Outputs: stream with its stream name, error with an ANSI-stripped
      traceback, and results resolved richest-first (image → svg → html →
      markdown → plain).
- [x] 1.3 Null rather than a throw for anything that is not a notebook.

## 2. Rendering

- [x] 2.1 `NotebookView`: markdown cells through the project markdown pipeline,
      code cells with their execution number, raw cells as themselves.
- [x] 2.2 Outputs under their cell, with stderr and errors toned apart.
- [x] 2.3 HTML output through `rehype-sanitize`, as project markdown is.
- [x] 2.4 A header with the cell counts, the language, and Run all.

## 3. Wiring

- [x] 3.1 One branch in `Editor.tsx`, mirroring markdown's, with the same source
      toggle.
- [x] 3.2 `nbconvert --execute --inplace` in a terminal pane, path quoted.

## 4. Verify

- [x] 4.1 Unit tests for the parser: both source shapes, missing ids, execution
      counts, richest-first resolution, stderr, ANSI in a traceback, language
      fallbacks, four kinds of malformed input, and an unknown output type.
- [x] 4.2 i18n for all five shipped locales.
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
- [x] 4.4 Driven in the running app on a notebook written for the purpose:
      markdown rendered as prose, four code cells with execution numbers `[1]`,
      `[2]`, `[ ]`, `[3]`, stdout and stderr distinguished, a traceback with its
      colour stripped, and a result carrying both an HTML table and an ASCII
      repr shown as the table. The source toggle went to the JSON and back.
