## 1. Bundle format & core (`src/lib/settings-sync.ts`)

- [ ] 1.1 Define the bundle type: `kind: "reado.settings-bundle"`, `schema`
      (integer version), `app` (Reado version), `exportedAt` (ISO timestamp),
      and a `data` block with `settings`, `extensions` (enabled/disabled ids),
      and a reserved `keymap` section.
- [ ] 1.2 `buildBundle()` — read the portable slices from `useSettings` and
      `useExtensions`; explicitly omit `reado.recents`, `reado.sessions`,
      `reado.workspace` layout, and any absolute paths. Never include secrets.
- [ ] 1.3 `parseBundle(text)` — JSON-parse + validate `kind` and `schema`;
      reject malformed/wrong-kind input; refuse a newer `schema` than this build
      supports; ignore unknown fields for forward compatibility.
- [ ] 1.4 `applyBundle(bundle)` — apply `data.settings` into `useSettings.set`
      and `data.extensions` into `useExtensions`; ignore unknown setting keys.
- [ ] 1.5 `summarizeBundle(bundle)` — a plain list of what import will change,
      for the confirmation UI.

## 2. Export / Import wiring

- [ ] 2.1 "Export settings…" action in `src/components/organisms/Settings.tsx`:
      build the bundle, save via the Tauri save dialog (default
      `reado-settings.json`).
- [ ] 2.2 "Import settings…" action: open a file, `parseBundle`, show the
      summary, apply on confirm; surface validation errors plainly.
- [ ] 2.3 Command Center commands for Export/Import (explicit trigger only).
- [ ] 2.4 A short "What syncs / what doesn't" note in the Settings UI.

## 3. i18n

- [ ] 3.1 Add EN + IT copy for the actions, the scope note, the import summary,
      and validation errors (`src/i18n/locales/en.json`, `it.json`).

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green.
- [ ] 4.2 Manual: export on machine A, import on machine B → theme, reading aids,
      and enabled extensions match; recents/sessions/`.reado/` untouched.
