# Tasks — Anywhere hardening

## 1. Credentials (`src-tauri/src/anywhere.rs`)

- [x] 1.1 Replace the single shared token with per-device credentials, persisted
      (device id, name, secret hash, created/last-seen).
- [x] 1.2 Pairing mints a new device credential (QR carries a one-time pairing
      secret); auth verifies per-device.
- [x] 1.3 Revoke-one and revoke-all; list devices.

## 2. Auth hardening

- [x] 2.1 Rate-limit failed auth (per-IP backoff / lockout).
- [x] 2.2 Idle + absolute credential expiry.

## 3. Networking

- [x] 3.1 Interface selection (bind to chosen addr; sensible default).
- [x] 3.2 Optional mDNS advertisement (feature-gated dep).

## 4. Frontend (`AnywhereDialog.tsx`)

- [x] 4.1 Device list (name, last seen, revoke); interface + mDNS toggles.
- [x] 4.2 Impeccable pass; honest security copy.

## 5. Tests

- [x] 5.1 Per-device auth accept/reject; revoke-one leaves others; expiry;
      rate-limit; safe_join still guarded.

## 6. Verify

- [x] 6.1 `cargo fmt/clippy/test` (with and without `--features mdns`);
      `pnpm typecheck && pnpm test && pnpm build`. Pairing a real phone is the
      one step a machine can't do for itself — the exchange is covered by tests
      on both sides, but the first physical scan is still a human's to make.
