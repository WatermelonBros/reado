# 12 — Reado Anywhere

Opt-in LAN server for phone review. Entry: `AnywhereDialog.tsx`; `anywhere_*`.

**Cases: 25.**

---

### TC-ANY-0001 — Initially off
**As a** user, **when I** not enable it, **I expect** anywhere_status = null.
- **Result:** PASS

### TC-ANY-0002 — Enable starts the server
**As a** user, **when I** enable Anywhere, **I expect** an HTTPS LAN URL, fingerprint, token.
- **Result:** PASS

### TC-ANY-0003 — Status reflects running
**As a** user, **when I** have it running, **I expect** status reports the URL.
- **Result:** PASS

### TC-ANY-0004 — Enable idempotent
**As a** user, **when I** enable twice, **I expect** the same server, not an error.
- **Result:** TODO

### TC-ANY-0005 — Pairing dialog
**As a** user, **when I** open the Anywhere dialog, **I expect** an explanation + QR to scan.
- **Result:** PASS

### TC-ANY-0006 — QR shown when running
**As a** user, **when I** have the server running, **I expect** a QR code rendered.
- **Result:** PARTIAL

### TC-ANY-0007 — Fingerprint shown
**As a** user, **when I** pair, **I expect** the cert fingerprint shown for verification.
- **Result:** TODO

### TC-ANY-0008 — Disable stops server
**As a** user, **when I** disable, **I expect** the server stopped (status null).
- **Result:** PASS

### TC-ANY-0009 — Project registered for phone
**As a** user, **when I** open a project + Anywhere on, **I expect** it listed for the phone.
- **Result:** TODO

### TC-ANY-0010 — Recents published
**As a** user, **when I** have Anywhere on, **I expect** recents published for the phone.
- **Result:** TODO

### TC-ANY-0011 — Single-use pairing token
**As a** user, **when I** pair, **I expect** the token is single-use.
- **Result:** TODO

### TC-ANY-0012 — No console errors
**As a** user, **when I** enable/open/disable, **I expect** no uncaught errors.
- **Result:** PASS

### TC-ANY-0013 — Phone: pair via QR
**As a** user, **when I** pair via QR, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0014 — Phone: view the diff on phone
**As a** user, **when I** view the diff on phone, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0015 — Phone: leave a comment from phone
**As a** user, **when I** leave a comment from phone, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0016 — Phone: launch the agent from phone
**As a** user, **when I** launch the agent from phone, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0017 — Phone: open a project on the desktop from phone
**As a** user, **when I** open a project on the desktop from phone, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0018 — Phone: publish the resolve-loop
**As a** user, **when I** publish the resolve-loop, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0019 — Phone: reject an invalid cert
**As a** user, **when I** reject an invalid cert, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0020 — Phone: expire a used token
**As a** user, **when I** expire a used token, **I expect** the LAN flow works securely.
- **Result:** MANUAL (real device)

### TC-ANY-0021 — Anywhere dialog at zoom 0.8
**As a** user, **when I** open the dialog at zoom 0.8, **I expect** the QR and text scale and stay legible.
- **Result:** TODO

### TC-ANY-0022 — Anywhere dialog at zoom 1.0
**As a** user, **when I** open the dialog at zoom 1.0, **I expect** the QR and text scale and stay legible.
- **Result:** TODO

### TC-ANY-0023 — Anywhere dialog at zoom 1.25
**As a** user, **when I** open the dialog at zoom 1.25, **I expect** the QR and text scale and stay legible.
- **Result:** TODO

### TC-ANY-0024 — Anywhere dialog at zoom 1.5
**As a** user, **when I** open the dialog at zoom 1.5, **I expect** the QR and text scale and stay legible.
- **Result:** TODO

### TC-ANY-0025 — Anywhere dialog at zoom 2.0
**As a** user, **when I** open the dialog at zoom 2.0, **I expect** the QR and text scale and stay legible.
- **Result:** TODO
