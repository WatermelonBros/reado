# Tasks — Phase 2: Interface & review

## 1. Store (`src/lib/store.ts`)

- [x] 1.1 Added fields with defaults: `reduceMotion` ("system"), `tabBar`
      ("multiple"), `scrollbar` ("auto"), `cursorStyle` ("line"), `cursorBlink`
      ("blink"), `showResolvedComments` (true), `inlineDiagnostics` (true).
- [x] 1.2 New fields carry their defaults via persist merge (purely additive; no
      value transform needed, so no version bump).

## 2. Settings UI (`src/components/organisms/Settings.tsx`)

- [x] 2.1 Renamed the `files` tab to `interface` (TabId + i18n); `FilesTab` →
      `InterfaceTab`.
- [x] 2.2 Interface tab surfaces `zoom` (preset Select), `reduceMotion`,
      `cursorStyle`/`cursorBlink`, `tabBar`/`scrollbar`, `fileIcons` (moved), and a
      Chrome section (activity bar, status bar, breadcrumbs, structure ribbon).
- [x] 2.3 System tab gained a Review section: `showResolvedComments`,
      `inlineDiagnostics` (with descriptions).

## 3. Apply the controls

- [x] 3.1 Reduce motion: `useApplyReduceMotion` resolves "system" via
      `matchMedia('(prefers-reduced-motion: reduce)')` and sets `data-reduce-motion`
      on `<html>`; CSS collapses decorative transitions/animations app-wide.
- [x] 3.2 Cursor style/blink: `data-cursor-*` on the editor host + CSS on
      `.cm-cursor` / `.cm-cursorLayer` (block/underline; solid/smooth/blink).
- [x] 3.3 Scrollbar: `data-scrollbar` + CSS on `.cm-scroller` (auto/always/hidden;
      hidden keeps wheel/keyboard scrolling).
- [x] 3.4 Tab strip: `Tabs.tsx` honours multiple/single/hidden; single/hidden
      never close a file (switching stays via palette/keys).
- [x] 3.5 Show resolved comments: `inlineCommentSource` filters resolved
      (done/discarded) out of the inline/gutter list when off; comment data is
      untouched and still reachable via history.
- [x] 3.6 Inline diagnostics: `data-inline-diagnostics` + CSS suppresses the
      `.cm-lintRange` squiggle when off; diagnostics data, Problems panel, tree
      counts, and overview ruler are unaffected.

## 4. i18n (`src/i18n/locales/{en,it}.json`)

- [x] 4.1 New "Interface" tab label + all new control labels/options/hints.

## 5. Cross-cutting

- [x] 5.1 Added new keys to the settings-sync allow-list.
- [x] 5.2 New fields live in `reado.settings` → cross-window sync via `storage`.

## 6. Verify

- [x] 6.1 typecheck + full test suite green (427 tests).
- [x] 6.2 Manual in the running app: reduce-motion (system/on/off), hidden/single
      tab strip still switchable, hide resolved comments recoverable, inline
      diagnostics off keeps Problems panel/tree counts.
