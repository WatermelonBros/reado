# Releasing Reado

Reado ships signed, cross-platform builds and updates itself automatically.

## How a release happens

Push a version tag and the [`release`](../.github/workflows/release.yml) workflow
builds installers for macOS (Apple Silicon + Intel), Linux (AppImage + `.deb`)
and Windows (MSI + NSIS), signs the updater artifacts, and publishes a **draft**
GitHub Release including `latest.json` (the updater manifest):

```bash
# bump the version in package.json and src-tauri/tauri.conf.json first
git tag v0.1.0
git push origin v0.1.0
```

Review the draft release on GitHub and publish it. Installed clients then see
the update on next launch (or via the command palette → "Check for updates").

## Signing keys (one-time setup)

Auto-updates are verified against the public key in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The matching **private
key must never be committed** — it lives only as a CI secret.

Generate a keypair (already done for this repo; regenerate to rotate):

```bash
pnpm tauri signer generate -w ~/.reado-signing.key
```

This writes the private key to `~/.reado-signing.key` and the public key to
`~/.reado-signing.key.pub`. Put the public key into
`src-tauri/tauri.conf.json`, then add two **repository secrets** on GitHub
(Settings → Secrets and variables → Actions):

| Secret | Value |
| ------ | ----- |
| `TAURI_SIGNING_PRIVATE_KEY` | the contents of `~/.reado-signing.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the key's password (empty if none) |

If you lose the private key you cannot ship updates that existing installs will
accept — keep it safe.

## The `reado` CLI

The CLI is built and linked locally with `pnpm cli:install`. To distribute it
alongside the app, bundle the `reado` binary or publish it separately; the agent
plugin in [`plugin/`](../plugin) documents installation.
