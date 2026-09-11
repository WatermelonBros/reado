## 1. Settings

- [x] 1.1 `formatOnPaste` and `formatOnType` booleans, default off, beside
      `formatOnSave` in the store and in Settings → Editor.
- [x] 1.2 i18n EN + IT (+ the locales this release adds).

## 2. On paste

- [x] 2.1 A paste handler that re-indents the inserted text with the language's
      indentation service: strip the pasted block's common indentation, re-apply
      the indentation the target line calls for, keep relative depth inside the
      block.
- [x] 2.2 Only when the paste spans a line break or lands at the start of a line —
      pasting a word into the middle of an expression must not move anything.
- [x] 2.3 One undo step for the paste and its re-indentation together.

## 3. On type

- [x] 3.1 Read `documentOnTypeFormattingProvider` from the server capabilities:
      first trigger character plus `moreTriggerCharacter`.
- [x] 3.2 On typing one of them, send `textDocument/onTypeFormatting` with the
      position after the character and the current tab settings, and apply the
      returned edits.
- [x] 3.3 Ignore a late answer whose document version has moved on.

## 4. Verify

- [x] 4.1 Unit tests: pasting an over-indented block into a nested position
      re-indents it and keeps its internal shape; a mid-line paste is untouched;
      both settings off change nothing; the trigger-character set is read from the
      server's capabilities and a non-trigger character sends nothing.
- [x] 4.2 CHANGELOG entry under `[Unreleased]`.
