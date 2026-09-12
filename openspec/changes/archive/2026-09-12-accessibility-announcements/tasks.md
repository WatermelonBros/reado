## 1. The channels

- [x] 1.1 `a11y.ts`: an announcer store with a nonce (so a repeat is a repeat),
      a polite/assertive flag, and the opt-in gate in one place.
- [x] 1.2 `cue()`: one lazily created AudioContext, an oscillator with a ramped
      gain so it does not click, and a silent failure where audio is absent.
- [x] 1.3 `Announcer`: two visually-hidden regions, keyed by the nonce.

## 2. What gets announced

- [x] 2.1 The caret's line — number, text, diagnostics — on a line change only.
- [x] 2.2 The cue for an error or warning on that line.
- [x] 2.3 The diff's region count on open, and each jump's region, added and
      removed lines, and location — from the keyboard as well as the buttons.
- [x] 2.4 A finished test run's tally, assertively when something failed.
- [x] 2.5 `aria-label` on the editor's content, naming the file.

## 3. Settings

- [x] 3.1 `screenReader` and `audioCues`, off by default, in the Interface tab's
      accessibility section, with the hint that says why it is not detected.
- [x] 3.2 Index entries so both are searchable.

## 4. Verify

- [x] 4.1 Unit tests: silence with the setting off, the nonce on a repeat,
      assertive delivery, an empty message ignored, no cue when off, a lower tone
      for an error than a success, and a platform with no audio.
- [x] 4.2 i18n for all five shipped locales.
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.
- [x] 4.4 Driven in the running app: the settings controls, then the live
      region read back directly — it carried "Riga 6, expect(add(2, 3)).toBe(5)"
      on a caret move, and "Modifica 1 di 2, 2 righe aggiunte, 1 rimossa, alla
      riga 1" on a diff jump. Every count was one too high at first: a chunk's
      end offset points past its trailing newline, so the untouched line after
      it was being counted. Pinned by `DiffAnnounce.uitest.tsx`.
