> The **desktop is the brain**, the **phone is a thin client**. One opt-in TLS
> server in the shared Rust backend serves a PWA + a session API over the LAN;
> the phone pairs by QR (token + pinned cert) and reads/comments/runs the agent
> against the same `.reado/` overlay. LAN-only — a VPN extends reach for free.

## 1. Local server (Rust, shared backend)

- [x] 1.1 Opt-in TLS server in the shared backend (one process, all windows);
      self-signed cert generated on enable (in-memory for now — persistence moves
      to the pairing slice). Binds nothing until enabled.
- [x] 1.2 `anywhere_enable` / `anywhere_disable` (+ `anywhere_status`) commands;
      disable shuts the server down via the axum handle.
- [x] 1.3 Pick the LAN address + free port; expose them (plus cert fingerprint and
      pairing token) to the UI via `AnywhereInfo`.

## 2. Pairing & security

- [x] 2.1 QR payload built (`https://<lan-ip>:<port>/#token=…&fp=…`). Simplified:
      the token doubles as the bearer (not single-use yet); re-enabling mints a
      new token, which revokes every phone.
- [~] 2.2 Token → credential: the token *is* the credential (phone stores it in
      localStorage). Persistent per-device credentials are deferred.
- [x] 2.3 `/api/*` gated by `Authorization: Bearer <token>` middleware; mismatch → 401.
- [x] 2.4 Self-signed cert; fingerprint encoded in the QR + shown in the desktop
      dialog. (Programmatic pinning in a browser PWA isn't possible — first-connect
      trust is the accepted-warning model.)

## 3. Mobile PWA — shell & read

- [x] 3.1 Self-contained PWA served at `/` (+ web manifest); pairs from the URL
      fragment. (Service worker / offline shell deferred.)
- [x] 3.2 Lists the desktop's open project windows; select one to scope the session.
- [x] 3.3 File-tree browse + read a file with syntax highlighting (a compact
      built-in highlighter, read-only).
- [x] 3.4 Diff view: working diff (`git diff`), read-only, +/- coloured.

## 4. Mobile PWA — review actions

- [x] 4.1 Leave anchored comments (tap a line → sheet → POST to `.reado/`). (Replies deferred.)
- [ ] 4.2 Approve drafts / resolve threads / mark read — deferred.
- [~] 4.3 Phone writes to the same `.reado/`; the desktop picks it up via its file
      watcher. (Live push the other way is part of the notifications slice.)
- [x] 4.4 Trigger AI pre-review from the phone (desktop runs it via an event). (Curation deferred.)

## 5. Agent (live, two-way terminal)

- [x] 5.1 "Run the agent" from the phone → desktop event → `dispatchToAgent`,
      scoped to the selected project.
- [ ] 5.2 Stream the agent terminal's PTY output to the phone in real time — deferred.
- [ ] 5.3 Send phone input back to the agent's PTY — deferred.

## 6. Notifications (in-app channel)

- [ ] 6.1 In-app notification channel — deferred (pairs with the Async Review Loop events).

## 7. Desktop surface

- [x] 7.1 "Reado Anywhere" dialog (Modal): enable/disable + the QR (token +
      fingerprint payload), URL copy, fingerprint shown. Command-palette entry to
      open it. Themed with the app's tokens.
- [ ] 7.2 Paired-devices list with per-device revoke. (with the pairing slice)

## 8. Glue

- [x] 8.1 No capability entries needed: app `#[tauri::command]`s aren't gated, and
      the native socket isn't under the permission system.
- [x] 8.2 i18n strings (EN + IT) for the desktop surface. (The PWA is self-contained, EN.)
- [~] 8.3 Rust tests: fingerprint shape, token uniqueness, path-traversal guard.
      (Auth/round-trip integration tests deferred.)
