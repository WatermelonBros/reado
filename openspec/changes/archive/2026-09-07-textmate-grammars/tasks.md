> Depends on `openvsx-marketplace` (install path, contribution model, themes).
> The highest-risk change of the set: an untrusted regex engine on the editor's
> hot path. The bounding work in section 3 is not optional polish.

## 1. Engine

- [x] 1.1 Add a TextMate grammar interpreter and its regex engine (WebAssembly
      build), loaded lazily — only when a file actually needs a contributed
      grammar, never on startup.
- [x] 1.2 Grammar registry: resolve a scope name to a contributed grammar, and
      resolve embedded references across installed extensions.
- [x] 1.3 Parse both grammar serialisations found in packages.
- [~] 1.4 Tests: registry resolution, embedded reference resolved and
      unresolved, both serialisations.

## 2. Editor integration

- [x] 2.1 A CodeMirror highlighting layer driven by the tokenizer, carrying the
      per-line rule stack so tokenization is incremental across edits and
      scrolling.
- [x] 2.2 Selection rule: language pack if present, else contributed grammar,
      else plain text. Verified against the outline, focus block, syntax-aware
      selection and nesting cues, which stay Lezer-backed.
- [x] 2.3 Re-tokenize on edit from the changed line's stack, not from the top of
      the file.
- [~] 2.4 Tests: precedence rule; edit invalidation; disable/uninstall reverts to
      plain text without error.

## 3. Bounding

- [x] 3.1 Per-line time budget with abandonment to plain text.
- [x] 3.2 Maximum tokenized line length.
- [x] 3.3 Work window tied to the visible region plus lookahead.
- [x] 3.4 Quiet, attributable reporting when a grammar is abandoned.
- [~] 3.5 Tests: a deliberately catastrophic pattern is abandoned within budget;
      a long minified line is skipped; a several-thousand-line file stays within
      the large-file performance bar.

## 4. Theming by scope

- [x] 4.1 Scope-selector matcher with specificity, applied to contributed themes
      over grammar-highlighted files.
- [x] 4.2 Keep the tag mapping for language-pack files; one theme, two paths,
      visually consistent.
- [x] 4.3 Retire the interim common-scope approximation where scopes are real.
- [x] 4.4 Tests: specificity resolution; unmatched scope takes the default
      foreground.

## 5. Verify

- [x] 5.1 Live: install a grammar-only language extension from Open VSX; files of
      that language highlight, and disabling it reverts cleanly.
- [x] 5.2 Live: a well-known theme renders a grammar-highlighted file the way it
      renders in its origin editor.
- [~] 5.3 Live: a large file and a minified file stay responsive.
- [x] 5.4 Confirm the engine is not loaded for projects that need no contributed
      grammar (startup unaffected).
- [x] 5.5 `pnpm lint`, typecheck, `cargo test`, build green.

> Not covered by unit tests: 1.4, 2.4 and 3.5 need the WebAssembly regex engine
> and a mounted editor. 1.4 and 2.4 were covered by the live run instead (a Nix
> grammar installed from Open VSX highlights a `.nix` file, coloured by the
> contributed theme's own scope rules). 3.5 — a deliberately catastrophic
> pattern — has not been exercised; the budgets are in place but unproven under
> a hostile grammar.
