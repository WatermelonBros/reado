import { describe, it, expect } from "vitest";
import { modeFromColor } from "../claudeTheme";

describe("modeFromColor", () => {
  it("classifies a light background as light", () => {
    expect(modeFromColor("rgb(255, 255, 255)")).toBe("light");
    expect(modeFromColor("rgb(245, 243, 238)")).toBe("light"); // sepia-ish
  });

  it("classifies a dark background as dark", () => {
    expect(modeFromColor("rgb(24, 24, 27)")).toBe("dark");
    expect(modeFromColor("rgb(0, 0, 0)")).toBe("dark");
  });

  it("falls back to dark when the color can't be parsed", () => {
    expect(modeFromColor("transparent")).toBe("dark");
    expect(modeFromColor("")).toBe("dark");
  });
});
