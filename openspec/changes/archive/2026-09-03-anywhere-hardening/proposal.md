## Why

"Reado Anywhere" (the LAN phone companion, `anywhere.rs`) is functionally rich
but explicitly a first cut: its own header notes that stable, persisted device
credentials are "a later refinement". Today it uses a **single shared session
token** bound to `0.0.0.0` on every interface — regenerating it (disable/enable)
revokes *all* paired devices at once, there is no per-device revocation, no token
expiry, no rate-limiting on failed auth, and no discovery beyond scanning a QR.
For a feature that exposes a project over the network, the trust model deserves to
be first-class.

## What Changes

- **anywhere-hardening** (capability):
  - **Per-device credentials**: each paired phone gets its own persisted
    credential, listed and individually revocable, so removing one device doesn't
    log out the others.
  - **Auth hardening**: rate-limit failed auth attempts and add an expiry / idle
    timeout to device credentials.
  - **Interface scoping**: let the user bind to a chosen interface instead of
    always `0.0.0.0`, defaulting to the least-open sensible option.
  - **Discovery**: optional mDNS advertisement so a paired phone can find the desk
    without re-scanning a QR each session (QR stays the pairing root of trust).
  - A device-management UI (list, name, revoke) in the Anywhere dialog.

Out of scope: internet/relay access (Anywhere stays LAN-only by design); end-to-end
encryption beyond the existing TLS; multi-user accounts.

## Capabilities

### Added Capabilities

- **anywhere-hardening** — per-device persisted credentials with individual
  revocation, auth rate-limiting and expiry, interface scoping, and optional mDNS
  discovery, so the LAN companion's trust model is explicit and manageable rather
  than a single shared token.
