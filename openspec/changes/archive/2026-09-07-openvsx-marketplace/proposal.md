## Why

The extension system landed with a deliberately narrow first kind (language
servers) and a bundled catalogue. Its own tasks list "additional declarative
kinds: themes, snippets, syntax grammars" as the next phase, and its manifest
model was shaped for exactly that.

Users, though, do not want *a* theme — they want **their** theme, the one they
already use, plus their icon set and their snippets. Curating that by hand does
not scale and never converges: taste is long-tail. There is already a public
registry of these things in a documented format, and it is not Microsoft's.

**Open VSX** (Eclipse Foundation) serves the same `.vsix` packages under an open
API, and is what every non-Microsoft editor uses. Microsoft's own marketplace is
not an option: its terms restrict in-product acquisition to Visual Studio family
products, and Microsoft has enforced that by cutting off other editors. Building
a core feature on an API the vendor has demonstrated it will close is not a
trade-off, it is a scheduled outage.

The insight that makes this a weeks-sized project rather than a years-sized one:
**a `.vsix` is a zip containing a `package.json` with a `contributes` block, and
most of what users want from extensions lives in that block as data, not code.**
Themes are colour JSON. Icon themes are JSON plus assets. Snippets are JSON.
Language configuration is JSON. Reado can consume all of it without ever running
a line of extension JavaScript — which keeps the existing "safe by default"
requirement intact rather than trading it away.

That constraint is a product position, not an apology. Reado ships an agent, a
terminal, and filesystem access; an extension host would make every installed
extension a supply-chain hole in all three. "Real extensions, no arbitrary code"
is the honest and defensible line.

## What Changes

- **Open VSX becomes the source for declarative extension kinds.** The curated
  registry does not go away: it remains the only source for anything that spawns
  a process (`language-server`, `formatter`). The two sources coexist with
  different trust levels, and the marketplace makes the difference visible.
- **Extensions are classified before install, from metadata alone.** Open VSX
  serves an extension's `package.json` separately from its `.vsix`, so Reado
  decides what an extension is without downloading it. Three tiers:
  **fully supported** (no code entry point — everything it does, works),
  **partially supported** (has a code entry point, but also contributions Reado
  can use — Reado takes the data and never runs the code, and says so), and
  **unsupported** (nothing but code), which never appears in the marketplace at
  all — Reado lists what it can install, not a catalogue of what it can't.
- **Acquisition is a backend concern.** Download, checksum, unzip and path
  confinement happen in Rust with hard size and entry-count caps. The webview
  never fetches from the network, so the CSP hardening stays as it is.
- **Four contribution kinds become real**: colour themes, icon themes, snippets,
  and language configuration. Each maps onto machinery Reado already has —
  `theming`, the file tree, `@codemirror/autocomplete`, and CodeMirror's
  bracket/comment handling.
- **Imported themes are held to Reado's own bar.** The theming capability
  requires WCAG AA and colour-vision validation for shipped themes; imported
  themes are run through the same check and the result is shown before the user
  adopts one. Reado does not silently become inaccessible because a popular
  theme is.
- **Full lifecycle**: search, install, update, disable, uninstall. Unlike a
  language server — where uninstall was deferred because there is no reliable
  cross-package-manager removal — a declarative extension is a directory Reado
  owns, so uninstall is exact.

## Capabilities

### Modified Capabilities

- `extensions`: adds Open VSX as a second, untrusted-by-design source for
  declarative kinds; adds `.vsix` acquisition, verification and confined
  unpacking; adds pre-install classification into support tiers; adds the
  colour-theme, icon-theme, snippet and language-configuration contribution
  kinds; adds update and uninstall.
- `theming`: colour themes may be contributed by installed extensions, and
  contributed themes are subject to the same contrast and colour-vision
  validation as shipped ones.

## Phasing

This change is sequenced so each step is separately useful:

1. Acquisition and classification: search, tiering, download, verify, unpack,
   uninstall — with **colour themes** as the first consumer.
2. Icon themes and snippets.
3. Language configuration.

TextMate grammars are the natural fourth consumer and are their own change
(`textmate-grammars`), because they need a regex engine and an editor-side
tokenizer rather than a JSON mapping.

## Out of Scope

- Running extension code, in any sandbox. Unchanged from the original spec.
- Microsoft's marketplace, for the licensing reasons above.
- TextMate grammars (next change), debuggers/DAP, and any contribution that
  implies a command, view, menu, keybinding, or settings surface.
- Publishing to Open VSX from Reado.
