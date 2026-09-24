## 1. Web boot hook

- [x] 1.1 Move the startup body of `src/main.tsx` into `export function boot()` in
      `src/boot.tsx`, unchanged; `main.tsx` calls `boot()`.

## 2. UI slots

- [x] 2.1 `src/lib/slots.ts`: `SlotName` union, `registerSlot`, per-slot contribution
      list; `Slot` component rendering each contribution in its own error boundary
      (logging failures).
- [x] 2.2 Place `activitybar.account` in `ActivityBar.tsx`, under the Settings button.
- [x] 2.3 Place `settings.footer` in the settings' bottom row, beside the version.
- [x] 2.4 UI tests: empty slots add no element; a registered component renders; a
      throwing component is contained and logged.
- [x] 2.5 Dev-only slot preview behind `VITE_PREVIEW_SLOTS`, loaded by `boot()` before
      the first render and absent from release builds.

## 3. Native hooks

- [x] 3.1 `run_with(extend)` in `src-tauri/src/lib.rs`, applied after core plugins;
      `run()` delegates to it.
- [x] 3.2 Second-instance forwarding of non-file arguments to registered handlers;
      files keep opening.
- [x] 3.3 Rust tests for argument splitting (files vs forwarded) and handler dispatch.

## 4. Docs and verify

- [x] 4.1 `CONTRIBUTING.md`: what belongs in the core vs the official build's closed
      modules; the slots are filled only by the official build.
- [x] 4.2 `CHANGELOG.md` under Unreleased (internal: extension points, no user-facing
      change) if the project records such changes; otherwise skip.
- [ ] 4.3 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `cargo fmt/clippy/
      test` for all three crates; run the app and confirm the activity bar and settings
      look unchanged; run with `VITE_PREVIEW_SLOTS=1` and check each placeholder
      sits where intended.
