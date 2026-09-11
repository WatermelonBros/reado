## Why

Reado's interface exists in English and Italian. Every string is already a key in
`en.json` (the type system enforces it — a hard-coded string can't reach the UI),
so a new language is a file, not a feature. Three of the largest developer
populations that are not served today are Spanish, French and German.

## What Changes

- `es`, `fr` and `de` locale files, complete against `en.json`'s keys.
- The language picker lists them; the startup default follows the OS language for
  any locale Reado has, instead of only Italian.
- The locale list becomes data: a locale is a file plus one entry, so the picker,
  the i18n resources and the type checks cannot disagree about which languages
  exist.

## Capabilities

### Modified Capabilities

- `project-workspace`: the interface is available in English, Italian, Spanish,
  French and German, and follows the OS language when it is one of them.
