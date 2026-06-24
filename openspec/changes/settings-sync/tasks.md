> Implemented as a **clipboard/pasted-text** bundle rather than file I/O: adding
> an unconfined filesystem write/read command would contradict Reado's security
> hardening (path-confined fs, command allowlist). A hosted backend stays future.

## 1. Bundle format & core (`src/lib/settingsSync.ts`)

- [x] 1.1 Versioned bundle: `{ version, settings, extensionsDisabled }`.
- [x] 1.2 `buildBundle()` reads the portable slices from `useSettings` (an explicit
      key allow-list) and `useExtensions.disabled`; omits recents/sessions/workspace
      layout and absolute paths; no secrets.
- [x] 1.3 `parseBundle(text)` JSON-parses + validates shape; rejects malformed input.
- [x] 1.4 `parseBundle` refuses a bundle whose `version` is newer than this build.
- [x] 1.5 `summarizeBundle` produces the import confirmation summary.

## 2. Export / Import wiring

- [x] 2.1/2.2 Export copies the bundle to the clipboard; Import prompts for a
      pasted bundle, shows the summary, and applies on confirm (invalid/too-new
      bundles are rejected with a message).
- [x] 2.3 Command-palette commands for Export / Import (explicit trigger only).
- [x] 2.4 The import confirmation states what will change (settings + disabled
      extensions); scope (no secrets / project-local state) is documented in the
      module header.

## 3. i18n

- [x] 3.1 EN + IT copy (`sync.*`).

## 4. Verify

- [x] 4.1 typecheck + build green (cargo unaffected).
- [ ] 4.2 Manual cross-machine round-trip — needs two machines.
