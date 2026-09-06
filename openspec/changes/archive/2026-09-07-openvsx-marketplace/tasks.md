> Large and phased. Step 1 (acquisition + colour themes) must land real value on
> its own: "install your theme from Open VSX" is shippable without steps 2-3.

## 0. Design

- [x] 0.1 Support tiers and the contribution whitelist, written down as the one
      place that decides what Reado accepts.
- [x] 0.2 Interface-colour mapping table: which of the theme format's colour keys
      map onto which Reado semantic tokens, and how the remainder are derived
      from the declared light/dark base.
- [x] 0.3 Token-scope mapping table: theme token scopes → Reado highlighting
      tags, for the common scopes. Interim until grammars land.
- [x] 0.4 On-disk layout: per-extension directory keyed by namespace, name and
      version, plus the installed-extension index.

## 1. Acquisition (Rust)

- [x] 1.1 Registry client: search with paging, and fetch a single extension's
      published manifest without downloading its package.
- [x] 1.2 Classifier over the manifest: code entry point, extension pack,
      dependencies, whitelisted contribution keys → tier + reason.
- [x] 1.3 Download with HTTPS, checksum verification where published, and caps on
      download size, uncompressed size and entry count.
- [x] 1.4 Unpack with path confinement: reject absolute, traversing, and symlink
      entries; write only inside the extension directory; nothing marked
      executable.
- [x] 1.5 Atomic install: stage, then swap; a failure leaves no partial
      directory and no registration.
- [x] 1.6 Uninstall removes the directory; update installs the new version then
      removes the old, keeping the old on failure.
- [x] 1.7 Path-confined asset reader for interface use.
- [x] 1.8 Tests: traversal entry, absolute entry, symlink entry, oversized
      archive, too many entries, truncated download, checksum mismatch, asset
      traversal, atomic-failure cleanup.

## 2. Model (frontend)

- [x] 2.1 Extend the extension model with the declarative kinds and their source;
      persist installed/enabled state alongside the existing store.
- [x] 2.2 Tolerant contribution parser (comments, trailing commas) with
      per-contribution error capture, so one bad file does not sink an extension.
- [x] 2.3 Tests: tolerant parsing, per-contribution isolation.

## 3. Colour themes

- [x] 3.1 Map a contributed theme onto Reado's semantic palette; derive
      unspecified tokens from the declared base.
- [x] 3.2 Map token scopes onto highlighting tags via the table from 0.3.
- [x] 3.3 Register contributed themes in the theme picker and in the light/dark
      pair used by System and "Trust Reado" modes.
- [x] 3.4 Run the existing contrast and colour-vision validation over contributed
      themes; surface the verdict in the picker.
- [x] 3.5 Fall back to a built-in theme of the same polarity when the active
      theme's extension is disabled or uninstalled, and say why.
- [x] 3.6 Tests: sparse theme completion, scope mapping, disable/uninstall
      fallback, validation verdict.

## 4. Marketplace surface

- [x] 4.1 Search field, paged results, publisher, icon, verified badge, tier
      badge; fully supported ranked first.
- [x] 4.2 Install / update / disable / uninstall actions with progress and
      failure states.
- [x] 4.3 Classify search results and show only the installable ones.
- [x] 4.4 Offline: installed list stays usable, quiet notice for the catalogue.
- [x] 4.5 Curated (executable) and Open VSX (declarative) sources are visually
      distinguishable, with the trust difference stated once, not per row.

## 5. Icon themes

- [x] 5.1 Resolve icons by file name, extension and language id, with open and
      closed folder variants; built-in icons fill the gaps.
- [x] 5.2 Font-based and image-based icon definitions, both through the confined
      asset reader.
- [x] 5.3 Tests: resolution precedence, missing definition falls back.

## 6. Snippets

- [x] 6.1 Convert snippet bodies to the editor's snippet representation:
      placeholders, tab stops, final stop, choices.
- [x] 6.2 Substitute the variables Reado can resolve; strip the rest so no
      placeholder syntax reaches the document.
- [x] 6.3 Offer snippets in completions, scoped to their declared languages.
- [x] 6.4 Tests: tab-stop round-trip, unsupported variable stripped, language
      scoping.

## 7. Language configuration

- [x] 7.1 Comment tokens feed comment toggling; bracket pairs feed bracket
      matching; auto-closing pairs feed typing.
- [x] 7.2 Built-in language packs take precedence over contributed configuration.
- [x] 7.3 Tests: new language gains comment toggling; built-in unchanged.

## 8. Verify

- [x] 8.1 Live: install a well-known theme, an icon theme and a snippet pack from
      Open VSX; all three work; uninstall leaves nothing behind.
- [x] 8.2 Live: a partially supported extension installs its data and states what
      is unavailable; a pure code extension never appears in results.
- [~] 8.3 Live: dev build verified end to end (search, install, theme applied,
      uninstall falls back). A *packaged* build and an offline start are still
      unverified.
- [x] 8.4 Confirm no extension content is executed and the content security
      policy is unchanged.
- [x] 8.5 `pnpm lint`, typecheck, `cargo test`, build green.
