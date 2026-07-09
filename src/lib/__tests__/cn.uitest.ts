// The cn() class merger: tailwind-merge so a caller's className overrides an
// atom's defaults, with falsy values dropped.
import { describe, it, expect } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("lets a later class win a Tailwind conflict", () => {
    // Same utility group (background) → the last one wins, not both kept.
    expect(cn("bg-surface", "bg-canvas")).toBe("bg-canvas");
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-ink", false, null, undefined, "font-bold")).toBe("text-ink font-bold");
  });

  it("keeps non-conflicting classes", () => {
    expect(cn("rounded-md text-sm", "text-ink")).toBe("rounded-md text-sm text-ink");
  });

  it("returns an empty string with no input", () => {
    expect(cn()).toBe("");
  });
});
