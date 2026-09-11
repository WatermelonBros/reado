## 1. Plumbing

- [x] 1.1 One registry of locales (code, label, messages) that `i18n/index.ts`, the
      settings picker and the `Locale` type all read.
- [x] 1.2 Startup default: the first registered locale matching the OS language,
      English otherwise.

## 2. The translations

- [x] 2.1 `es.json`, `fr.json`, `de.json` — every key of `en.json`, placeholders
      (`{name}`) preserved verbatim.
- [x] 2.2 Product nouns stay English where they are Reado's own names (Anywhere,
      the agents' names, `.reado/`).

## 3. Verify

- [x] 3.1 Test: every locale has exactly `en.json`'s key set (no missing, no
      extra), and every string's placeholder set matches English's — a dropped
      `{name}` is a bug the type system cannot catch.
- [x] 3.2 Test: the picker lists every registered locale.
- [x] 3.3 CHANGELOG entry under `[Unreleased]`.
