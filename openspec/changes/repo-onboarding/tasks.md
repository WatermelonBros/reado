> Generation runs through the **terminal agent** (Reado's AI model): a prompt asks
> the agent to write the overview to `.reado/onboarding.md`; Reado polls + renders.

## 1. Cache + generation

- [x] 1.1 Cached at `.reado/onboarding.md`; a cache hit shows immediately,
      Regenerate re-dispatches.
- [x] 1.2 `show()`/`regenerate()` dispatch a prompt (`runInTerminal`) for an
      architecture / entry-points / key-modules overview, then poll (~90s).

## 2. Navigable overview

- [x] 2.1 Rendered as Markdown in `OnboardingModal`; relative Markdown links open
      the referenced project file (external links open in the browser).
- [x] 2.2 Triggered from the command palette ("Understand this repo").

## 3. Staleness

- [~] 3.1 Explicit Regenerate; automatic staleness vs HEAD/commit DEFERRED (the
      overview is cached until regenerated).

## 4. i18n + verify

- [x] 4.1 EN + IT (`onboarding.*`).
- [x] 4.2 typecheck + cargo check + build green.
