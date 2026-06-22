## Why

Reado's code intelligence depends on external **language servers**, but today
the supported set is a hardcoded allowlist and the user must install each server
by hand with a different command per language (`npm i -g pyright`, `rustup
component add rust-analyzer`, `go install gopls`, …). There is no way, from
inside the app, to discover what's available, see what's installed, or install
it. For a non-expert that friction is fatal — the feature effectively doesn't
exist for them.

Rather than build a one-off "language-server installer", we introduce a small,
**declarative extension system** with the language servers as its first kind.
This gives users a familiar mental model (a marketplace of installable add-ons)
and gives Reado a clean way to grow — themes, snippets, syntaxes later — without
the cost and risk of a code-running extension host.

Deliberately **not** VS Code: extensions are declarative manifests, not
arbitrary JavaScript. Reado just shipped a security pass (CSP, no
arbitrary-command IPC); a code-executing extension host would undo that and runs
against the product's calm, trustworthy character. The power users actually need
here — language servers, and later themes/snippets — is fully declarative.

This is a large, phased subsystem; scoped so Phase 1 (language servers) lands
real value on its own.

## What Changes

- A **declarative extension model**: each extension is a manifest (id, name,
  description, version, `kind`, contributions, install instructions) with **no
  executable code**. The first `kind` is `language-server`.
- A **curated registry**: a versioned JSON catalogue (hosted by the project)
  lists available extensions. Reado fetches it to populate the marketplace.
  Because a manifest's declared server command is what gets spawned, the spawn
  source must stay trusted — the registry is curated/signed, never arbitrary
  user- or web-supplied commands (preserving the `lsp_start` hardening).
- A **marketplace** as a **sidebar tool**: lists available and installed
  extensions with status (installed / enabled / not found on PATH), and
  install / enable / disable actions. Installed/enabled state is persisted.
- **Language servers become extensions**: the hardcoded Rust `server_command`
  allowlist and the frontend `SERVERS` table migrate into bundled
  language-server extension manifests (TypeScript, Rust, Python, Go, C/C++,
  Bash to start). Each manifest declares command, args, file types, language
  ids, and a per-platform/package-manager install command.
- **Detection on the real PATH**: server presence is checked against the user's
  **login-shell PATH**, not the minimal PATH a GUI app inherits from the Finder.
- **Guided install**: clicking Install runs the extension's declared install
  command in the **integrated terminal** (transparent, uses the user's own
  package managers); status refreshes when it completes.
- **PATH fix for spawning**: `lsp_start` (and detection) resolve and use the
  login-shell PATH, so a packaged `.app` actually finds servers installed via
  npm/cargo/go/brew.

## Capabilities

### Added Capabilities
- `extensions`: a declarative extension system — manifest model, curated
  registry, a sidebar marketplace (browse / install / enable / disable, with
  detection), and `language-server` as the first extension kind (migrating the
  hardcoded server allowlist), including login-shell PATH resolution for both
  detection and spawning.

## Phasing

1. **Foundation + language servers** (the real need): manifest model + curated
   registry + sidebar marketplace + login-shell PATH resolution (detection and
   spawn) + guided install via the terminal. Migrate the current hardcoded LSP
   allowlist to bundled extension manifests. Degrade gracefully when a server is
   absent (index fallback unchanged).
2. **More declarative kinds**: themes, snippets, syntax grammars contributed by
   extensions.
3. **(Future, gated)** code-running extensions behind a sandbox — explicitly out
   of scope now; the manifest is shaped so it could be added without breaking
   the declarative kinds.

## Out of Scope

- Arbitrary-code / JS extension host and a public extension API.
- Third-party open submission to the registry (start curated).
- Auto-downloading prebuilt server binaries (guided terminal install instead;
  managed binaries can be revisited later as an install strategy).
