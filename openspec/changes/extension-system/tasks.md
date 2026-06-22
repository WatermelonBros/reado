> Large, phased. Phase 1 (language servers) must land real value on its own.

## 0. Design

- [x] 0.1 Manifest shape for `language-server` (`src/lib/extensions.ts`
      `LangServerExt`): id, name, description, install command, requires. The
      spawn command/args stay in the Rust allowlist keyed on `id` (curated).
- [~] 0.2 Registry shape/hosting — Phase 1 ships **bundled** manifests as the
      catalogue (curated, in-app). A remote `registry.json` is deferred.

## 1. Foundation (Rust)

- [x] 1.1 Login-shell PATH resolver (`login_shell_path`, cached `OnceLock`):
      `$SHELL -ilc 'echo $PATH'`, used for detection and spawning.
- [x] 1.2 `lsp_start` sets the resolved PATH; `lsp_installed` does a `which`-style
      check on it.
- [~] 1.3 Manifest source: bundled list loaded in the frontend. Remote-registry
      fetch + validation deferred with 0.2.
- [x] 1.4 Persisted enabled/disabled state (`useExtensions`, zustand persist).

## 2. Language-server extensions

- [x] 2.1 The previously hardcoded servers ship as bundled manifests (TS, Rust,
      Python, Go, C/C++, Bash). (Spawn binaries stay in the Rust allowlist by
      design — security: not chosen by a fetched manifest.)
- [x] 2.2 `serverFor` resolves only **enabled** servers; spawn uses the curated
      command + resolved PATH.
- [x] 2.3 Detection per server via `lsp_installed` (resolved PATH).

## 3. Marketplace (sidebar tool)

- [x] 3.1 New `extensions` sidebar tool (`ExtensionsPanel`) listing servers with
      install status.
- [x] 3.2 Install → runs the manifest's install command in the integrated
      terminal; manual re-check button + on-mount check. Prerequisites shown.
- [~] 3.3 Enable / disable wired to persisted state. **Uninstall** deferred (no
      reliable cross-package-manager uninstall yet).
- [~] 3.4 Offline/empty states — N/A in Phase 1 (bundled catalogue always shows);
      revisit when the remote registry lands.

## 4. Verify

- [ ] 4.1 A fresh machine can discover + install a server from the marketplace
      and get LSP features without touching a shell manually. (Live check.)
- [ ] 4.2 Packaged `.app` (Finder-launched) detects and spawns PATH-installed
      servers; graceful fallback when absent; no code executed from manifests.
      (Live check.)
- [x] 4.3 typecheck + cargo check + build green.

## 5. Later phases (tracked, not Phase 1)

- [ ] 5.1 Additional declarative kinds: themes, snippets, syntax grammars.
- [ ] 5.2 (Gated) sandboxed code-running extensions — only if a real need appears.
