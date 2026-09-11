# Design — credentials in the browser pane

## Context

The pane is a native webview parked over a placeholder (see the `in-app-browser`
change). It has no extension host, no profile UI, and no relationship to the
user's real browser. Everything below follows from that.

## The three candidates, and why one wins

**1. Browser extension (Bitwarden/1Password in the pane).** Not possible.
WKWebView has no extension model at all; WebKitGTK likewise; WebView2 can host
Chrome extensions in principle but wry/Tauri does not surface it, and macOS —
where the user works — would still be uncovered. Rejected as impossible, not as
expensive.

**2. Import the session from Chrome.** Technically real: Chrome's cookie DB is
SQLite, decryptable with the "Chrome Safe Storage" key from the Keychain, and
`wry`/Tauri expose `set_cookie` on the webview's cookie store, so even HttpOnly
cookies could be injected. Rejected anyway: it is per-browser and per-platform
(macOS Keychain, Windows DPAPI/app-bound, Linux kwallet/gnome-keyring), it breaks
whenever Chrome changes its encryption, `localStorage` needs a second mechanism
(a locked LevelDB) to cover token-in-storage apps, and it reads another
application's credential store to do it. High maintenance, high blast radius, and
it solves "be logged in once" rather than "log in".

**3. The vendor's own CLI.** `op` (1Password) and `bw` (Bitwarden) are supported,
documented, cross-platform interfaces to the same vault the user already trusts,
unlocked by the same desktop app. They answer the exact questions this feature
asks — *which login matches this origin*, *what is its current TOTP*, *save this
new login* — and they are the mechanism the vendors intend non-browser apps to
use. This is what we build.

## Shape

```
BrowserPanel toolbar ──▶ vault_* commands (Rust) ──▶ `op` / `bw` (login-shell PATH)
        │                                                    │
        │◀─────────────── items (title, username, otp?) ──────┘
        ▼
   preview_eval(fill script) ──▶ the page's form fields
```

- **Backend detection** reuses `proc::on_path`, which probes the *login-shell*
  PATH — a Finder-launched GUI otherwise misses every brew/npm install, which is
  the "it's installed but Reado says it isn't" bug we already fixed once.
- **Every CLI call is `spawn_blocking`**: these do network and Keychain/biometric
  I/O and must never run on the UI thread.
- **Secrets are request-scoped.** A password or TOTP is fetched at the moment of
  the fill, handed to the fill script, and dropped. Nothing is cached in the
  store, persisted, or put in the layout/settings files.
- **Bitwarden needs a session** (`bw unlock --raw`); it is held in a process-memory
  `Mutex<Option<String>>` and passed to `bw` via `BW_SESSION` in the child's env,
  never on the argv (argv is world-readable in `ps`). 1Password needs no session
  handling: `op` brokers biometric unlock through the desktop app itself.
- **Origin matching** is done on the item's stored URLs: host equality, plus a
  registrable-suffix match so `app.example.com` finds the `example.com` entry.
  Ordering puts exact-host matches first; the user always sees which item they are
  about to use.

## Filling a page we do not control

The fill script runs through the existing `preview_eval` channel. Two things make
a naive `input.value = x` fail on real pages, and the script handles both:

- **Framework-controlled inputs.** React/Vue track the value through a property
  setter; assigning to `.value` bypasses it and the framework overwrites the field
  on the next render. The script uses the native `HTMLInputElement.prototype.value`
  setter and then dispatches `input` + `change`, which is what a real keystroke
  produces.
- **Finding the fields.** Password field = `input[type=password]` (visible ones).
  Username = the labelled/autocompleted candidate nearest above it
  (`autocomplete=username|email`, `type=email`, else the previous text input).
  One-time code = `autocomplete=one-time-code` first, then the well-known
  name/id patterns, then a row of single-character inputs (the six-box pattern),
  filled one character per box with events per box.

Where nothing matches, the fill reports *what it could not find* rather than
silently doing nothing — a login form that Reado cannot read is an honest failure.

## Redaction — drawn at the agent boundary

The pane's capture bridge records `fetch`/XHR request bodies, so a login POST
carries the password. Two consumers see that capture, and they are not the same
kind of thing:

- **The inspector** is the user looking at their own page. Chrome DevTools shows
  the same POST body with the same password; hiding it here would only make
  Reado's inspector worse than the tool it replaces. It keeps the real value.
- **The agent** is a different process, reading from disk, with a transcript that
  leaves the machine. It gets the redacted view.

So redaction is applied at the boundary crossing into the agent, not in the store.
Every byte the agent can see passes through exactly three points in
`BrowserPanel`, and one filter covers all of them:

1. `previewPersistState` — the `.reado/preview-console.json` /
   `preview-network.json` mirror the `reado mcp` server exposes.
2. `previewPutResult` — the result of every agent command, **including `eval`**.
   The agent never talks to the webview directly: it writes a command file, Reado
   executes it, and Reado writes the result back. That is where an
   `eval("…input[type=password]…value")` answer is intercepted.
3. "Send to agent" from the inspector.

Values filled from the vault are registered for the page's lifetime and replaced
with `«redacted»` on the way out through those three points.

## The active read: consent, not filtering

Redaction works on values Reado hands over. It cannot work on values the agent
goes and fetches: the filter matches the literal secret, so `btoa(el.value)` or
`el.value.split("")` walks straight past it. "The agent can never read a password
field" is therefore not something a filter can promise — only a refusal can.

So the read is gated, not filtered:

- At the moment Reado is about to execute an agent command, it asks the page
  whether any password input holds a value. If one does, the command is **refused**
  — not executed, not filtered.
- The refusal is an answer, not an error: the agent is told the page holds a
  credential and that the user has not granted access, so it can say so instead of
  retrying blindly. Reado never blocks waiting for a human.
- The refusal surfaces in Reado as a request the user can grant: *the agent asked
  for access to this page's data; if you accept it can see what you type here, so
  mind any credential you do not want to share*. Granting lifts the gate for that
  page — password fields included; there is no half-grant.
- The grant is scoped to the page: it lapses when the pane navigates or closes, and
  is never persisted. The next login page starts closed again.

This covers any password in the page, not only the ones Reado filled — a password
typed by hand is the same secret. The rule the user can hold in their head is: *a
password field with something in it means the agent is out, unless you let it in.*

The two mechanisms answer different questions and both stay on: the gate governs
what the agent may read from the live page, the redaction governs what gets
written into a file on disk.

## Fixes riding along

- **Address bar.** `http://` was prepended to everything, so `google.com` was
  requested over cleartext and a search phrase produced an unparseable URL that
  failed with no message. Now: existing scheme wins; a host-shaped entry gets
  `https://` unless it looks like a dev server (loopback, `.local`/`.test`, or an
  explicit port); anything else is a search.
- **App Transport Security.** macOS blocks plain `http://` to any non-loopback
  host, so a dev server reached through an `/etc/hosts` alias never loaded, at any
  URL, from any control. The app declares the exception; the pane is a developer
  tool aimed at the user's own machine.
- **Agent allowlist.** `isOriginAllowed` compared the hostname to two literal
  strings, and `addAllowedOrigin` had no caller — so a local server behind a host
  alias was permanently refused. Loopback now covers every spelling, and the
  user's own navigation is the grant.
