## Why

The browser pane is where a frontend is actually used, and using a frontend means
**logging into it**. Today that is the point where the pane stops being a browser:
there is no password manager. The user's credentials live in 1Password or
Bitwarden, and the pane cannot reach them.

The obvious answer — install the Bitwarden/1Password *browser extension* — is not
available and never will be: the pane is a system webview (WKWebView on macOS,
WebKitGTK on Linux, WebView2 on Windows), and those engines do not load browser
extensions. Copying the session out of Chrome was the other candidate and is
rejected in [design.md](./design.md).

What **is** available is the path desktop apps already use: both vendors ship a
first-class CLI (`op`, `bw`) that talks to the same vault, unlocks through the
same desktop app, and is supported for exactly this. Reado can ask it for the
login that matches the page's origin and fill the form — including the one-time
code, and including creating a new login when the user is signing *up*.

Alongside it, three defects that make the pane fail before a login is even
reached: a typed address that goes nowhere, a plain-`http://` host the platform
silently refuses to load, and an agent navigation allowlist with no way to grant
anything.

## What Changes

- **Vault-backed autofill in the browser pane.** A control in the pane's toolbar
  lists the vault logins matching the current page's origin; choosing one fills
  the page's username/password fields. Explicit user action, one page at a time.
- **One-time codes.** Where the vault entry carries a TOTP secret, Reado fills the
  page's one-time-code field with the current code, as a separate explicit step
  (the code is fetched when asked for, not held).
- **New logins.** On a page with no matching entry, Reado can generate a password,
  fill the signup form with it, and save a new login item to the vault under the
  page's origin — so signing up in the pane does not create a credential that
  exists nowhere.
- **Listed where extensions are listed.** Both CLIs appear in Reado's extensions:
  installed, among the user's own; missing, as a suggestion carrying the install
  command for this OS and any prerequisite beyond the binary. Someone running the
  Bitwarden or 1Password *app* has no way to guess that a system webview needs the
  CLI instead — so Reado says it where they will look, and the pane points there
  when it finds nothing.
- **Two backends, auto-detected.** 1Password (`op`) and Bitwarden (`bw`), resolved
  on the login-shell PATH. Neither installed → the control says which CLI to
  install, and does nothing else. A locked vault → an explicit unlock, whose
  session is held in memory for the app's lifetime and never written to disk.
- **Secrets do not reach the agent.** Values filled from the vault are redacted
  at every point where pane state crosses to the agent — the `.reado/` mirror, the
  result of any agent command including page evaluation, and "send to agent". The
  user's own inspector keeps showing the real values, as a browser's developer
  tools do.
- **A page holding a password is off limits to the agent until the user says
  otherwise.** While any password field in the page holds a value, agent commands
  are refused rather than filtered — a filter on the result can be defeated by
  transforming the value, a refusal cannot. The refusal surfaces as a request the
  user can grant for that page, with plain wording about what granting means; the
  grant lapses when the page navigates and is never persisted.
- **Address bar that navigates.** A bare host gets the right scheme (`https://`,
  or `http://` when it looks like a dev server); input that is not an address
  becomes a web search instead of failing silently.
- **Plain-`http://` hosts load.** macOS App Transport Security no longer blocks the
  pane from a dev server reached by name (an `/etc/hosts` alias, a LAN IP).
- **Agent navigation can be granted.** Loopback recognition covers `*.localhost`,
  `::1`, `0.0.0.0` and all of `127.0.0.0/8`; navigating the pane yourself grants
  the agent that origin — previously the allowlist had no way to be filled.

## Capabilities

### Added Capabilities

- `browser-credentials`: fill logins, one-time codes and newly generated
  credentials into the browser pane from the user's own password manager, through
  its official CLI, on explicit user action.

### Modified Capabilities

- `browser-preview`: the address bar resolves what the user types (scheme
  inference, search fallback), plain-`http://` hosts are reachable, and the agent
  navigation allowlist recognises every loopback spelling and is granted by the
  user's own navigation.
