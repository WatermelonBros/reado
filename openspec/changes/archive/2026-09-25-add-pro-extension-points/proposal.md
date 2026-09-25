## Why

Reado's official build will add closed modules (account sign-in, settings sync, and
later paid features) on top of this open-source app. For that to work without forking
the app or patching its files, the core needs a few generic places where an embedding
build can plug in. Today the web entry renders immediately, the Tauri builder is
sealed inside `run()`, and the UI has no extension surfaces — so the only way to add
anything is to edit core files.

## What Changes

- **UI slots**: named, empty-by-default places in the interface (an account entry at the bottom
  of the activity bar under Settings, and the settings' footer row beside the version) that render whatever components an
  embedding build registers before startup.
- **Web boot hook**: the startup in `src/main.tsx` moves into an exported `boot()`,
  so another entry can register its contributions and then start the same app.
  `main.tsx` keeps calling `boot()`; behavior is unchanged.
- **Tauri builder hook**: `reado_lib::run_with(extend)` hands the configured
  `tauri::Builder` to a caller before it runs, so an embedding binary can add plugins
  (which carry their own commands). `run()` stays and calls `run_with` with no extension.
- **Second-instance arguments**: arguments the core does not consume (anything that is
  not a file to open) are forwarded to registered handlers instead of being dropped,
  so an embedding build can receive links opened by the OS.
- No new behavior in the community build: slots render nothing, no network access, no
  sign-in.

## Capabilities

### New Capabilities

- `host-extension-points`: UI slots, the web boot hook, the Tauri builder hook, and
  forwarding of unconsumed second-instance arguments.

### Modified Capabilities

None.

## Impact

- `src/main.tsx` → `src/boot.tsx` (startup) + thin `main.tsx`.
- New `src/lib/slots.ts` (registry) and a `Slot` component; `ActivityBar` and the
  settings footer gain slot placements.
- `src-tauri/src/lib.rs`: `run_with`, second-instance forwarding.
- Dev-only slot preview (`VITE_PREVIEW_SLOTS=1`) that fills every slot with a
  labelled placeholder, to check placement in the running app.
- `CONTRIBUTING.md`: a short note on what belongs in the core versus the official
  build's closed modules.
- No dependency changes.
