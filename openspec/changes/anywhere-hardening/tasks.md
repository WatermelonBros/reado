# Tasks — Anywhere hardening

## 1. Credentials (`src-tauri/src/anywhere.rs`)

- [ ] 1.1 Replace the single shared token with per-device credentials, persisted
      (device id, name, secret hash, created/last-seen).
- [ ] 1.2 Pairing mints a new device credential (QR carries a one-time pairing
      secret); auth verifies per-device.
- [ ] 1.3 Revoke-one and revoke-all; list devices.

## 2. Auth hardening

- [ ] 2.1 Rate-limit failed auth (per-IP backoff / lockout).
- [ ] 2.2 Idle + absolute credential expiry.

## 3. Networking

- [ ] 3.1 Interface selection (bind to chosen addr; sensible default).
- [ ] 3.2 Optional mDNS advertisement (feature-gated dep).

## 4. Frontend (`AnywhereDialog.tsx`)

- [ ] 4.1 Device list (name, last seen, revoke); interface + mDNS toggles.
- [ ] 4.2 Impeccable pass; honest security copy.

## 5. Tests

- [ ] 5.1 Per-device auth accept/reject; revoke-one leaves others; expiry;
      rate-limit; safe_join still guarded.

## 6. Verify

- [ ] 6.1 `cargo fmt/clippy/test`; `pnpm typecheck && pnpm test`; pair a device.
