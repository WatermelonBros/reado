// UI test setup: jest-dom matchers + auto-cleanup between tests.
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { afterEach, vi } from "vitest"

afterEach(() => cleanup())

// user-event installs its focus/blur patch as getter-only accessors (once per
// window); rind's Menu wraps `HTMLElement.prototype.focus` by plain assignment,
// which then throws. Install the patch up front and turn it into ordinary
// writable methods, so both can wrap it. ponytail: drop once rind wraps focus
// with defineProperty.
userEvent.setup()
for (const key of ["focus", "blur"] as const) {
  const fn = HTMLElement.prototype[key]
  Object.defineProperty(HTMLElement.prototype, key, {
    value: fn,
    writable: true,
    configurable: true,
  })
}

// react-i18next: every component test wants the key back, not a translation.
// The i18n:{} field and the initReactI18next no-op cover components that pull in
// i18n init transitively (docInfo → lsp → i18n/index). One variant, one place.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}))
