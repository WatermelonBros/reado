## 1. Slot

- [x] 1.1 `editor.tabbar` in `SlotProps`; rendered by the primary `Tabs` outside the
      scrolling tablist.
- [x] 1.2 Test: empty slot adds nothing; a registered component renders once, in the
      primary group only.

## 2. Editor extensions

- [x] 2.1 `registerEditorExtension` / `editorExtensionsFor` in `src/lib/editorExtensions.ts`;
      `CodeView` adds them.
- [x] 2.2 Test: a registered factory's extension reaches the editor of its file only.
- [x] 2.3 `registerWriteGuard` / `writeBlocked`, consulted by `api.writeFile`; test.
