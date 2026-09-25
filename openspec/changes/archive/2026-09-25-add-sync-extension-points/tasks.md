## 1. Slots with context

- [x] 1.1 `src/lib/slots.ts`: a per-slot props map (`SlotProps`), `registerSlot` typed
      by it, and the two new names `statusbar.left` and `comment.actions`.
- [x] 1.2 `atoms/Slot.tsx`: `<Slot name props>` passes the props to each contribution,
      still each in its own boundary.

## 2. Placements

- [x] 2.1 `StatusBar.tsx`: `statusbar.left` at the start of the left group.
- [x] 2.2 `CommentThread.tsx`: `comment.actions` in the header before the close
      button, with the comment id and the project root.
- [x] 2.3 `slotPreview.tsx`: placeholders for both.

## 3. Comment format API

- [x] 3.1 `reado-core`: `pub fn parse_comment(text) -> Result<(CommentMeta, Vec<Message>)>`
      and `pub fn render_comment(&CommentMeta, &[Message]) -> Result<String>`.
- [x] 3.2 Round-trip test (parse → render → parse).

## 4. Tests and verify

- [x] 4.1 UI tests: empty slots add nothing; a `comment.actions` contribution gets
      the comment id and root and updates when another comment opens; a
      `statusbar.left` contribution renders in the status bar.
- [x] 4.2 `pnpm lint && pnpm typecheck && pnpm test`; `cargo fmt/clippy/test` for all three crates.
