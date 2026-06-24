## 1. Cache + fingerprint

- [ ] 1.1 `src/lib/synopsis.ts`: types (`Synopsis { purpose, symbols[], context, fingerprint, generatedAt }`) + `fingerprintFile(content)` (cheap hash + byte size).
- [ ] 1.2 Read/write cached synopses under `.reado/synopsis/<path-key>.json` (reuse the existing `.reado` API; add a small `src-tauri/src/synopsis.rs` only if config API can't reach the path).
- [ ] 1.3 `isStale(cached, currentFingerprint)`: true when content diverges substantially (size delta / hash mismatch beyond a threshold).

## 2. Generation

- [ ] 2.1 `composeSynopsisPrompt(file, code, symbols)` in `src/lib/review.ts`: asks the agent for a concise synopsis — purpose, key symbols, how it fits the codebase — in a structured form the cache can store.
- [ ] 2.2 Seed "key symbols" from existing document symbols / Outline (`src/lib/lsp.ts`) so the agent doesn't re-derive them.
- [ ] 2.3 Wire generation through the existing agent contract; persist the result to the cache with the current fingerprint.

## 3. UI: button + modal

- [ ] 3.1 Add a small **Synopsis** button in the editor header / breadcrumb area (`src/components/molecules/Breadcrumb.tsx` or the header in `ProjectView.tsx`); icon in `src/components/atoms/icons.tsx`.
- [ ] 3.2 `src/components/organisms/SynopsisModal.tsx` on the `Modal` atom: shows purpose + key symbols + context; explicit Generate / Regenerate; honest loading / empty / cached / stale states. No inline-at-top rendering anywhere.
- [ ] 3.3 Stale banner ("may be out of date") with a Regenerate action when `isStale` is true.
- [ ] 3.4 Style with calm tokens (`bg-overlay`, `border-line`, `text-ink/muted/faint`, `accent`); ensure WCAG AA contrast and keyboard/focus handling via the Modal atom.

## 4. i18n

- [ ] 4.1 EN + IT strings for button label, modal title, states, and actions (`src/i18n/locales/en.json|it.json`).

## 5. Verify

- [ ] 5.1 typecheck + cargo check + build green.
- [ ] 5.2 Manual: button opens modal; Generate produces purpose + key symbols; result is cached under `.reado/synopsis/` and loads instantly on re-open; editing the file marks it stale and Regenerate refreshes it; nothing renders inline at the top of the file.
