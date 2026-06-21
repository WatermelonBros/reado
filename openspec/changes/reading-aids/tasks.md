## 1. Editor extensions

- [ ] 1.1 Occurrence highlight: a CodeMirror extension that, on selection/cursor change, finds the word at the cursor and decorates its other occurrences in the doc (muted token colour); debounced.
- [ ] 1.2 Syntax-aware selection: bind `selectParentSyntax` (expand) and a shrink command; add to keymap (e.g. `⌥⇧→/←`) and the menu/palette.
- [ ] 1.3 Indentation guides + bracket-pair colorization extensions, themed via tokens.
- [ ] 1.4 Outline-follows-cursor: surface the cursor line to the Outline panel; highlight the enclosing symbol.

## 2. Polish & verify

- [ ] 2.1 Tune colours so nothing competes with the comment gutter/selection (calm).
- [ ] 2.2 typecheck + build green; sanity-check on a large file (no jank).
