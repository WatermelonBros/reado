> Build order: the pane fixes (1) already landed and are useful alone. The vault
> backend (2) is what everything else stands on; fill (3) is the feature, OTP (4)
> and item creation (5) extend it. Redaction (6) and the agent gate (7) are not
> optional — they are what makes filling a credential here safe — and (8) closes
> it out.

## 1. Pane fixes (landed)

- [x] 1.1 The URL field resolves what was typed: scheme kept when given, `https`
      for a bare public host, `http` when it denotes a dev server (loopback, a
      development TLD, or an explicit port), web search otherwise.
- [x] 1.2 Declare the macOS App Transport Security exception so a plain-`http://`
      host that is not loopback loads in the pane (`Info.plist`, `Info.dev.plist`).
- [x] 1.3 Loopback recognition covers `*.localhost`, `127.0.0.0/8`, `::1`,
      `0.0.0.0`; the user's own navigation grants the agent that origin.
- [x] 1.4 An "open in your browser" control hands the current page to the system
      browser.

## 2. Vault backend (Rust)

- [x] 2.1 `vault.rs`: detect the backend (`op`, then `bw`) on the login-shell PATH
      via `proc::on_path`; report which one, or none, to the frontend.
- [x] 2.2 Every CLI invocation goes through `proc::command` and runs under
      `spawn_blocking`; failures carry the CLI's own stderr rather than an empty
      result.
- [x] 2.3 Bitwarden unlock: `bw unlock --raw`, session held in a process-memory
      `Mutex<Option<String>>`, passed to children as `BW_SESSION` in the env, never
      on argv, never persisted. 1Password: no session handling — `op` brokers its
      own unlock.
- [x] 2.4 `vault_lookup(url)`: items whose stored URLs match the origin — exact
      host first, then registrable-suffix matches — returned as `{id, title,
      username, hasOtp}` with **no secret in the list payload**.
- [x] 2.5 `vault_secret(id)` / `vault_otp(id)`: fetch password / current TOTP for
      one item at the moment of use.
- [x] 2.6 Unit-test the pure parts against recorded CLI JSON: origin matching
      (exact, subdomain, near-miss), ordering, and the `{id,title,username,hasOtp}`
      mapping for both backends' output shapes.

## 3. Fill (frontend)

- [x] 3.1 A toolbar control in the browser pane listing the matching items for the
      current origin; nothing happens without the user choosing one.
- [x] 3.2 Fill script over `preview_eval`: locate the password field and its
      username candidate, set values through the native `value` setter, dispatch
      `input` + `change`.
- [x] 3.3 Report honestly when the fields cannot be found — which one was missing —
      instead of a silent no-op.
- [x] 3.4 No backend installed / vault locked → the control says so and offers the
      one action that helps (install hint, unlock).
- [x] 3.5 UI test: item list rendering, choosing an item fills, missing-field
      failure surfaces, locked state offers unlock.

## 4. One-time codes

- [x] 4.1 A separate explicit action, offered only for items that carry a TOTP
      secret; the code is fetched when asked for and never stored.
- [x] 4.2 Fill `autocomplete=one-time-code`, the well-known name/id patterns, and
      the six-single-character-boxes pattern (one character per box, events per box).
- [x] 4.3 UI test: single field and split-box field both filled; item without a
      secret offers nothing.

## 5. Create a login

- [x] 5.1 Generate a password in Reado (20 chars, unambiguous alphabet) so both
      backends behave the same, fill the new-password field and its confirmation.
- [x] 5.2 Save a new login item to the vault carrying the page's origin, the
      entered username, and the generated password; confirm the save.
- [x] 5.3 A failed save is reported as such — never leave a credential that exists
      only in the page.
- [x] 5.4 UI test: generate → fill both fields → save called with the origin;
      failure path surfaces.

## 6. Redaction at the agent boundary

- [x] 6.1 Register every value filled from the vault for the page's lifetime.
- [x] 6.2 One filter, applied at the three points where state crosses to the agent:
      `previewPersistState` (the `.reado/` mirror), `previewPutResult` (every agent
      command result, `eval` included), and the inspector's "send to agent".
- [x] 6.3 The inspector keeps the real values — the user's own view of their own
      page is not degraded (a browser's DevTools shows the same body).
- [x] 6.4 Never log a vault secret at any level.
- [x] 6.5 Test: a captured login POST is redacted in the mirrored file, an `eval`
      returning the field's value is redacted in the command result, and the store
      the inspector renders still holds the real value.

## 7. The agent gate

- [x] 7.1 Before executing any agent command, evaluate whether a password field in
      the page holds a value (one check per command — no polling window in which a
      queued command slips through).
- [x] 7.2 Refuse the command while one does, with a reason the agent can report;
      never block on the user.
- [x] 7.3 Surface the request in Reado with the plain warning about what granting
      means; a grant lifts the gate for the current page, lapses on navigation or
      close, and is never persisted.
- [x] 7.4 Test: gated by a hand-typed password, ungated by an empty field, granted
      → commands run, navigation revokes, refusal is immediate with no grant.

## 8. Discoverability

- [x] 8.1 `VAULTS` manifests for `op` and `bw` — install command per OS, and the
      prerequisite the binary alone doesn't satisfy.
- [x] 8.2 A `credentials` facet and its filter option; the rows appear among the
      user's extensions when the CLI resolves, and as suggestions when it doesn't.
- [x] 8.3 Installed state from the same login-shell PATH probe every other tool
      uses, re-probed after an install runs.
- [x] 8.4 The pane's "no password manager" state links to the listing.
- [x] 8.5 Each row carries the vendor's own mark, drawn inline in its brand colour
      (Simple Icons paths, CC0; the marks stay their owners' trademarks) — no URL
      to fetch, nothing to 404, and it reads as *their* tool.
- [x] 8.6 A guide Reado writes for each CLI, shown on its page (they have no
      README to fetch): purpose, why not the browser extension, setup, how filling
      works, what happens to the secret, and troubleshooting. Real Markdown under
      `src/docs/vault/`, imported raw — each vault's own half plus one shared half
      per language, so the two can't drift. EN + IT, English as the fallback for
      any other locale.
- [x] 8.7 Test: offered with the install command when missing, installed once on
      the PATH, prerequisite stated, and the pane's link opens Extensions.

## 9. Boundaries and verify

- [x] 9.1 No vault command is reachable from the agent control channel or the MCP
      tool surface; assert it in the agent-command test.
- [x] 9.2 i18n EN + IT for every new string.
- [x] 9.3 CHANGELOG entry under `[Unreleased]`.
