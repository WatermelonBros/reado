## 1. Fetch

- [x] 1.1 Request `textDocument/documentLink` per document version when
      `documentLinkProvider` is set; cache per version.
- [x] 1.2 Resolve a link without a `target` through `documentLink/resolve` at the
      moment it is activated.

## 2. Present and activate

- [x] 2.1 Decorate the reported ranges as links, matching the existing `linkField`
      look, and only while the modifier is held (as Reado's links already behave).
- [x] 2.2 Activation: `file:` targets open in the editor at the link's line when
      the target carries a fragment; `http(s):` targets open the browser pane.
- [x] 2.3 A target that cannot be opened says so once, with the target in the
      message — never a silent no-op.

## 3. Verify

- [x] 3.1 Unit tests: ranges become links, a `file:` target opens the editor, an
      unresolved link is resolved on activation, an unopenable target reports.
- [x] 3.2 CHANGELOG entry under `[Unreleased]`.
