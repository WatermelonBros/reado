// UI test setup: jest-dom matchers + auto-cleanup between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// react-i18next: every component test wants the key back, not a translation.
// The i18n:{} field and the initReactI18next no-op cover components that pull in
// i18n init transitively (docInfo → lsp → i18n/index). One variant, one place.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
