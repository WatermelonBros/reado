## 1. The buffer

- [x] 1.1 A bounded ring buffer (2000) in a zustand store, fed from `logger.emit`
      — every frontend record already passes through it.
- [x] 1.2 The buffer respects the same enabled/level gate as the file sink; it is a
      mirror, not a second policy.
- [x] 1.3 Not batched: the store appends and the panel re-renders per record,
      which measured fine at the 2000-record cap. Batch it if a burst of IPC
      traces ever costs a frame.

## 2. Server output

- [x] 2.1 Backend: forward each language server's stderr line to the frontend as a
      `lsp:<server>` record (it is already read; today it is dropped).
- [x] 2.2 Frontend: land those on the same buffer, so they are one channel among
      the others.

## 3. The panel

- [x] 3.1 `OutputPanel` registered as a panel: a tab of the bottom dock beside the
      terminal (where VS Code keeps it) rather than an activity-bar entry, with a
      one-shot layout migration for existing arrangements, a palette/menu command
      that reveals it, and i18n EN + IT (+ the locales this release adds).
- [x] 3.2 Channel dropdown (targets seen, plus "All"), level filter, text filter,
      follow toggle, clear, copy-all.
- [x] 3.3 Capped rendering: the buffer is the cap (2000 rows), and a filter
      narrows it further. No virtualisation — add it if 2000 rows ever drag.
- [x] 3.4 A control in the panel that reveals the log file — the buffer holds the
      last 2000 records, the file holds everything, and the moment you need more
      than the panel has is the moment you are already looking at the panel.

## 4. Verify

- [x] 4.1 Unit tests: the ring drops the oldest past its cap, the channel list is
      derived from records seen, filters compose (channel + level + text), follow
      sticks to the newest and releases on scroll-up, and the panel is empty and
      silent when logging is off.
- [x] 4.2 CHANGELOG entry under `[Unreleased]`.
