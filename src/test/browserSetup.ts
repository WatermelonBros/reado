// Browser test setup: the app as it ships — real stylesheet (so there is a
// layout to check), real translations, real fonts — minus the Rust backend,
// which each test installs as a fake (src/test/fakeBackend.ts).
import "@testing-library/jest-dom/vitest"
import "@xterm/xterm/css/xterm.css"
import "@/styles/app.css"
import "@/lib/fonts"
import "@/i18n"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => cleanup())
