# Tasks — Notice surface

## 1. Store (`src/lib/notice.ts`)

- [x] 1.1 Replace the single `notice` slot with a `notices` array (id, kind,
      text). `show` pushes (capped, newest first); add `dismiss(id)` and keep
      `clear`. Ids from a monotonic counter (no `Date.now`/random in store).
- [x] 1.2 Add `notify(kind, text)` and `notifyError(scope, error)` helpers that
      log via `createLogger(scope)` and push a curated toast.

## 2. Component (`src/components/molecules/Notice.tsx`)

- [x] 2.1 Render the stack (map over `notices`), each its own auto-dismiss timer,
      manual dismiss on click, accessible roles.
- [x] 2.2 Enter/exit motion (rise + fade), gated on reduce-motion.

## 3. Wire silent failures

- [x] 3.1 `Editor` save path → `notifyError` on write failure.
- [x] 3.2 `ProjectView` watcher start / index rebuild / git refresh catches →
      `notifyError`.
- [x] 3.3 `agents.ts` dispatch failures route through the surface.

## 4. i18n

- [x] 4.1 `notice.saveFailed`, `notice.gitFailed`, `notice.watchFailed`,
      `notice.indexFailed`, generic `notice.actionFailed` in `en.json` + `it.json`.

## 5. Tests

- [x] 5.1 `notice.uitest.ts`: stack push/cap/dismiss, `notifyError` logs + pushes
      a curated (non-raw) message.

## 6. Verify

- [x] 6.1 `pnpm typecheck && pnpm test`; impeccable pass on the toast; reduce-motion
      check.
