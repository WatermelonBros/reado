## ADDED Requirements

### Requirement: Opt-In LAN Server

Reado SHALL host a single local server in the shared backend (one process for all
windows) that listens on the local network over TLS. The server SHALL start only
when the user explicitly enables "Reado Anywhere" and SHALL bind no port before
that. Disabling it SHALL stop listening and drop active connections.

#### Scenario: Server off by default

- **WHEN** Reado starts and the user has not enabled Reado Anywhere
- **THEN** no listening port is opened

#### Scenario: Enable starts the server

- **WHEN** the user enables Reado Anywhere
- **THEN** the server begins listening on the LAN over TLS and serves the mobile PWA

#### Scenario: Disable stops the server

- **WHEN** the user disables Reado Anywhere
- **THEN** the server stops listening and existing phone connections are closed

### Requirement: QR Pairing Over TLS

Reado SHALL pair a phone by displaying a QR that encodes the HTTPS LAN address, a
one-time, time-limited pairing token, and the self-signed certificate's
fingerprint. The phone SHALL exchange the token for a device credential. Because
the certificate is self-signed, the first connection SHALL require the user to
accept the browser's certificate warning once, after which the browser remembers
it; the fingerprint in the QR SHALL be available so the user can verify it.

#### Scenario: Scan to pair

- **WHEN** the user scans the displayed QR with the phone
- **THEN** the phone opens the encoded HTTPS LAN address and exchanges the token
  for a device credential

#### Scenario: One-time token

- **WHEN** a pairing token has already been redeemed (or has expired)
- **THEN** a second attempt to pair with that token is rejected

#### Scenario: First connection trusts the certificate once

- **WHEN** a phone connects to the self-signed server for the first time
- **THEN** the browser shows a certificate warning the user accepts once, and the
  fingerprint shown matches the one encoded in the QR

#### Scenario: Verify the fingerprint

- **WHEN** the user compares the certificate fingerprint shown by the browser with the one in the QR
- **THEN** they match for a genuine connection to that desktop

### Requirement: Remembered, Revocable Devices

A paired device SHALL receive a persistent credential so it can reconnect without
re-scanning. The desktop SHALL list paired devices and let the user revoke any of
them; a revoked device SHALL lose access immediately.

#### Scenario: Reconnect without re-scan

- **WHEN** a previously paired phone reconnects to an enabled server
- **THEN** it authenticates with its stored credential and is granted access without a new QR scan

#### Scenario: Revoke a device

- **WHEN** the user revokes a paired device from the desktop
- **THEN** that device can no longer connect and any active session for it is closed

### Requirement: Choose Among Open Projects

The phone SHALL see the list of project windows currently open on the desktop and
choose which one to review. All subsequent reading and actions SHALL apply to the
chosen project.

#### Scenario: List open projects

- **WHEN** a paired phone connects while several project windows are open on the desktop
- **THEN** the phone is shown the list of open projects to pick from

#### Scenario: Scope to the chosen project

- **WHEN** the user selects a project on the phone
- **THEN** the file tree, files, diff, and comments shown are those of that project

### Requirement: Read-First Mobile Browsing

From the phone the user SHALL be able to browse the project's file tree, open and
read individual files with syntax highlighting, and read the working or branch
diff — all read-only for the source code.

#### Scenario: Browse and read a file

- **WHEN** the user opens a file from the file tree on the phone
- **THEN** the file's contents are shown with syntax highlighting

#### Scenario: Read the diff

- **WHEN** the user opens the diff view on the phone
- **THEN** the changed files and their diff are shown read-only

### Requirement: Mobile Review Actions

From the phone the user SHALL be able to leave and reply to anchored comments and
approve/resolve threads and drafts. These actions SHALL write to the same
`.reado/` overlay the desktop uses, and the desktop SHALL reflect them live.

#### Scenario: Leave a comment from the phone

- **WHEN** the user adds an anchored comment to a line on the phone
- **THEN** the comment is written to the project's `.reado/` overlay and appears in the desktop UI

#### Scenario: Resolve from the phone

- **WHEN** the user resolves a thread (or approves a draft) on the phone
- **THEN** the change is persisted to `.reado/` and reflected on the desktop

### Requirement: AI Pre-Review From The Phone

From the phone the user SHALL be able to trigger an AI pre-review on the chosen
project and curate the resulting draft comments — approving or discarding each —
reusing the existing pre-review behavior. Drafts SHALL be written to the same
`.reado/` overlay, so the desktop and phone show the same drafts.

#### Scenario: Trigger a pre-review

- **WHEN** the user triggers an AI pre-review from the phone
- **THEN** the agent proposes draft comments on the changed lines, written to the project's `.reado/` overlay

#### Scenario: Curate drafts from the phone

- **WHEN** the user approves or discards a draft on the phone
- **THEN** the draft becomes an open comment or is removed, persisted to `.reado/` and reflected on the desktop

### Requirement: Run The Agent In A Live Interactive Terminal

From the phone the user SHALL be able to run the agent on the chosen project and
interact with it through a live, two-way terminal: the agent's output SHALL
stream to the phone in real time, and the phone SHALL be able to send input —
answering prompts, approvals, and free text. The agent runs on the desktop.

#### Scenario: Run and watch

- **WHEN** the user runs the agent from the phone
- **THEN** the agent starts on the desktop and its terminal output streams to the phone in real time

#### Scenario: Answer an interactive prompt

- **WHEN** the running agent asks for input (e.g. an approval) and the user responds from the phone
- **THEN** the input is sent to the agent's terminal and the agent proceeds

#### Scenario: Output mirrors the desktop terminal

- **WHEN** the agent is producing output
- **THEN** the phone shows the same output as the desktop terminal for that run

### Requirement: In-App Notification Channel

While the PWA is open, Reado SHALL deliver event notifications to the phone over
the live connection — for example agent finished, approval needed, or review
ready. The events SHALL be those produced by the Async Review Loop capability;
Reado Anywhere SHALL own only the delivery channel. Background push (screen-off
or PWA-closed) SHALL NOT be provided.

#### Scenario: Notify while open

- **WHEN** an event occurs (e.g. the agent finishes) while the PWA is open
- **THEN** the phone receives an in-app notification over the live connection

#### Scenario: No background push

- **WHEN** the PWA is closed or the phone screen is off
- **THEN** no push is delivered; the events are seen when the user next opens the PWA

### Requirement: LAN-Only, No Cloud

Reado Anywhere SHALL operate entirely over the local network with no Reado-hosted
backend. Reachability beyond the LAN SHALL be the user's own VPN; Reado SHALL NOT
expose the server to the public internet or perform NAT traversal.

#### Scenario: Works over a VPN

- **WHEN** the phone is on the same VPN as the desktop but off the physical LAN
- **THEN** pairing and review work unchanged, because the phone can reach the LAN address

#### Scenario: No external dependency

- **WHEN** the desktop has no internet connection but is on a local network with the phone
- **THEN** pairing and review still work
