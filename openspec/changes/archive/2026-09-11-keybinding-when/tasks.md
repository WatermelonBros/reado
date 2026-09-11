## 1. The model

- [x] 1.1 `when` on a parsed binding; the user's text format grows
      `combo = command when clause`, round-tripping through the editor.
- [x] 1.2 A context evaluator over a small vocabulary, read from the DOM and the
      stores at keystroke time — no ambient state to keep in sync.
- [x] 1.3 `!` and `&&`, and an unknown name that never matches and says so.

## 2. Resolution

- [x] 2.1 Match in order, first holding clause wins, unconditional last.

## 3. The editor

- [x] 3.1 Show and edit the clause in the keybindings editor.

## 4. Verify

- [x] 4.1 Unit tests: one combo two meanings, the fallback, negation,
      conjunction, unknown context.
- [x] 4.2 i18n for every shipped locale.
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
