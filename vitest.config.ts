import { defineConfig } from "vitest/config";

// Unit tests target pure logic (no DOM); component tests can add jsdom later.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
