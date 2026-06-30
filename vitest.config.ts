import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two test projects so `pnpm test` runs both on every OS:
//  - logic: pure helpers, no DOM (node env)
//  - ui:    component tests in a simulated DOM (happy-dom). These run identically
//           on macOS / Windows / Linux, so the UI layer is exercised on all three
//           in CI. (They can't catch real webview-engine differences — that needs
//           a per-OS build run — but they catch component/render/OS-logic bugs.)
export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8", // fast, and AST-remapped to Istanbul-grade accuracy (Vitest ≥3.2)
      reporter: ["text", "text-summary", "html", "lcov"],
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
      // No thresholds: coverage is a *report* you run locally (`pnpm
      // test:coverage`) to see where you stand — it never gates CI. Per-OS runs
      // hit slightly different code paths, so a hard floor flaked the build for
      // no real signal. CI runs plain `pnpm test`.
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
    ],
  },
});
