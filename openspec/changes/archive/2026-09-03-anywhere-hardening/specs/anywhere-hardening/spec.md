## ADDED Requirements

### Requirement: Per-device credentials with revocation

Reado SHALL issue each paired device its own persisted credential and SHALL let
the user list paired devices and revoke any one individually, without revoking the
others.

#### Scenario: Revoke one device

- **WHEN** two phones are paired and the user revokes one
- **THEN** the revoked phone loses access and the other stays connected

#### Scenario: Devices persist across restarts

- **WHEN** the app restarts
- **THEN** previously paired devices remain paired (their credentials persist)
  unless revoked

### Requirement: Auth hardening

Reado SHALL rate-limit failed authentication attempts against the Anywhere server
and SHALL expire device credentials after a configurable idle/absolute lifetime.

#### Scenario: Repeated bad tokens are throttled

- **WHEN** many requests arrive with an invalid token
- **THEN** the server throttles them rather than checking each at full rate

#### Scenario: Stale credential expires

- **WHEN** a device credential exceeds its lifetime
- **THEN** it is rejected until the device re-pairs

### Requirement: Interface scoping

Reado SHALL allow binding the Anywhere server to a chosen network interface
instead of always all interfaces, defaulting to the least-open sensible option.

#### Scenario: Bind to one interface

- **WHEN** the user selects a specific interface for Anywhere
- **THEN** the server listens only on that interface

### Requirement: Optional discovery

Reado SHALL offer optional mDNS advertisement of the Anywhere server so a
previously paired device can find it without re-scanning the QR, while the QR
remains the pairing root of trust. Discovery MAY be turned off.

#### Scenario: Paired device rediscovers the desk

- **WHEN** mDNS is enabled and a paired phone rejoins the network
- **THEN** it can locate the desktop without a fresh QR scan, still authenticating
  with its existing credential
