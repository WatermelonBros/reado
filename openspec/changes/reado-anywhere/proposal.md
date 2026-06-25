## Why

Reado's loop is read → comment → agent resolves. Today it's chained to the desk:
you have to be at the machine to read a diff, leave a comment, or kick off the
agent. But review is exactly the kind of work that happens in stolen moments — on
the couch, away from the desk, while something builds. Reado Anywhere puts the
read-first surface on your phone *without standing up any infrastructure*: the
desktop already holds the repo, the comments, and the agent; the phone just needs
to reach it.

The insight that keeps this open-source-friendly: the **desktop is the brain**
(your repo, your agent, your keys); the **phone is a thin read/comment client**.
Pairing is a QR scan over the local network — no account, no backend, no cloud
bill. On a VPN the same pairing reaches your desk from anywhere, for free. A
hosted relay for the no-VPN case is a separate, later capability.

## What Changes

- Add a single **opt-in local server** in the Tauri Rust backend (one process,
  shared across all windows). When the user opens "Reado Anywhere" it starts
  listening on the LAN **over TLS** and serves a mobile PWA plus a session API.
  No port is opened until the user asks.
- Add a **QR pairing flow**: the desktop shows a QR encoding the HTTPS LAN
  address, a one-time, time-limited pairing token, and the self-signed
  certificate fingerprint. The phone exchanges the token for a **persistent,
  desktop-revocable device credential**. Because the certificate is self-signed,
  the first connection asks the user to **accept the browser's certificate
  warning once** (then the browser remembers it); the fingerprint in the QR lets
  the user verify it.
- Add the **mobile PWA** (served by the desktop): a read-first client that lists
  the desktop's open project windows and lets the user pick one, then browse the
  file tree, read files with syntax highlighting, read the working/branch diff,
  leave and reply to anchored comments, approve/resolve threads and drafts,
  **trigger an AI pre-review and curate the draft comments**, and run the agent
  through a **live, two-way terminal** — output streams to the phone and the
  phone can send input (answer prompts, approvals, free text).
- Add an **in-app notification channel** over the live connection: while the PWA
  is open it surfaces events to the phone (agent finished, approval needed,
  review ready). The *events* are produced by the Async Review Loop capability;
  Reado Anywhere owns only the **delivery channel**. No background push.
- Phone actions mutate the **same `.reado/` overlay and project state** the
  desktop uses, so the desktop UI reflects them live (and vice-versa).
- Add a desktop **"Reado Anywhere" surface**: enable/disable, show the QR, list
  paired devices, and revoke a device.
- i18n strings (EN + IT) for the surface and pairing flow.

## Capabilities

### Added Capabilities
- `reado-anywhere`: pair a phone over the LAN by QR and review code from it — browse and read files with highlighting, read diffs, comment, approve, run an AI pre-review, and drive the agent through a live two-way terminal — with no account or backend.

## Out of Scope

- A hosted relay / sign-in for reaching the desktop without a VPN (a separate,
  later capability — `reado-anywhere-hosted`).
- Editing code on the phone. Reado on mobile is read-first: read, comment,
  approve, pre-review, run the agent — not an editor.
- Native iOS/Android apps, and background/web-push notifications (screen-off /
  PWA-closed). The v1 client is a PWA served by the desktop, and notifications
  are in-app only while it's open.
- Multi-user / team presence on the same project (this is a single user's own
  devices, not collaboration).
- Exposing the server to the public internet or any NAT traversal; reachability
  beyond the LAN is provided by the user's own VPN, not by Reado.
