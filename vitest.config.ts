import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

// Three test projects; `pnpm test` runs them all. CI runs the first two on every
// OS (`pnpm test:unit`) and the third in a job of its own:
//  - logic: pure helpers, no DOM (node env)
//  - ui:    component tests in a simulated DOM (happy-dom). These run identically
//           on macOS / Windows / Linux, so the UI layer is exercised on all three
//           in CI. (They can't catch real webview-engine differences — that needs
//           a per-OS build run — but they catch component/render/OS-logic bugs.)
//  - browser: the whole app in real Chromium against a fake backend, for what
//           happy-dom cannot see — layout: overlap, stacking, overflow.
//           `pnpm test:browser` alone. Needs Chromium, once:
//           `pnpm exec playwright install chromium`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    coverage: {
      provider: "v8", // fast, and AST-remapped to Istanbul-grade accuracy (Vitest ≥3.2)
      // json-summary + json are what the PR-comment action reads (totals and
      // per-file/changed-file detail); the rest are for humans.
      reporter: ["text", "text-summary", "html", "lcov", "json-summary", "json"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.uitest.{ts,tsx}",
        "src/test/**",
        "src/main.tsx", // app entry / bootstrap
        "src/lib/automation.ts", // dev-only test bridge, never ships
        "src/**/*.d.ts",
        "src/i18n/locales/**", // data
      ],
      // No thresholds: coverage is a *report* — locally via `pnpm
      // test:coverage`, and as a PR comment from the Linux CI run — never a
      // gate. Per-OS runs hit slightly different code paths, so a hard floor
      // flaked the build for no real signal.
    },
    projects: [
      {
        extends: true,
        test: { name: "logic", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "ui",
          include: ["src/**/*.uitest.{ts,tsx}"],
          environment: "happy-dom",
          setupFiles: ["src/test/setup.ts"],
        },
      },
      {
        extends: true,
        plugins: [tailwindcss()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.tsx"],
          setupFiles: ["src/test/browserSetup.ts"],
          // React's act() bookkeeping is for simulated DOMs; in a real browser the
          // updates come from real events and timers, and its warnings are noise.
          onConsoleLog: (log) => !/not wrapped in act|not configured to support act/.test(log),
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Reado's default window size: layout bugs depend on it.
            viewport: { width: 1280, height: 832 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
