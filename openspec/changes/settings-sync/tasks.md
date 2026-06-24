> Implemented as a **clipboard/pasted-text** bundle rather than file I/O: adding
> an unconfined filesystem write/read command would contradict Reado's security
> hardening (path-confined fs, command allowlist). A hosted backend stays future.

## 1. Bundle format & core (`src/lib/settingsSync.ts`)

- [x] 1.1 Versioned bundle: `{ version, settings, extensionsDisabled }`.
- [x] 1.2 `buildBundle()` reads the portable slices from `useSettings` (an explicit
      key allow-list) and `useExtensions.disabled`; omits recents/sessions/workspace
      layout and absolute paths; no secrets.
- [x] 1.3 `applyBundle(text)` JSON-parses + validates shape; rejects malformed
      input with no partial apply; ignores unknown setting keys.
- [~] 1.4 `applyBundle` applies settings via `useSettings.set` and disabled
      extensions via `useExtensions.setState`. (No newer-schema refusal yet —
      single schema version; revisit when v2 lands.)
- [ ] 1.5 `summarizeBundle` confirmation list — DEFERRED with the file/Settings UI.

## 2. Export / Import wiring

- [x] 2.1/2.2 Export copies the bundle to the clipboard; Import prompts for a
      pasted bundle and applies it (replaces the save/open-dialog approach).
- [x] 2.3 Command-palette commands for Export / Import (explicit trigger only).
- [ ] 2.4 "What syncs / what doesn't" note in the Settings UI — DEFERRED (the
      scope is documented here and in the module header; add to Settings UI later).

## 3. i18n

- [x] 3.1 EN + IT copy (`sync.*`).

## 4. Verify

- [x] 4.1 typecheck + build green (cargo unaffected).
- [ ] 4.2 Manual cross-machine round-trip — needs two machines.
