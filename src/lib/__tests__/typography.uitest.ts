// Reading typography: the letter-spacing setting and the font picker's data.
// The picker's old bug — six names, five absent on a clean machine, all falling
// through to the same system mono — is why the bundled and conditional faces are
// now two separate lists.
import { describe, expect, it } from "vitest"
import { BUNDLED_FONTS, fontName, fontStack, isPresetFont, SYSTEM_FONTS } from "@/lib/fonts"
import { clampRange, LETTER_SPACING_RANGE, useSettings } from "@/lib/store"

describe("letter spacing", () => {
  it("defaults to the standard rendering", () => {
    // Someone who never opens the setting must see exactly what they saw before.
    expect(LETTER_SPACING_RANGE.default).toBe(0)
    expect(useSettings.getState().letterSpacing).toBe(0)
  })

  it("clamps to the offered range", () => {
    expect(clampRange(-5, LETTER_SPACING_RANGE)).toBe(LETTER_SPACING_RANGE.min)
    expect(clampRange(99, LETTER_SPACING_RANGE)).toBe(LETTER_SPACING_RANGE.max)
    expect(clampRange(0.12, LETTER_SPACING_RANGE)).toBe(0.12)
  })

  it("reaches far enough to be the accommodation it exists for", () => {
    // Zorzi et al. found gains at spacings that look extreme to everyone else;
    // a range that stopped at "tasteful" would be useless to its users.
    expect(LETTER_SPACING_RANGE.max).toBeGreaterThanOrEqual(0.2)
  })

  it("persists like every other reading preference", () => {
    useSettings.getState().set({ letterSpacing: 0.08 })
    expect(useSettings.getState().letterSpacing).toBe(0.08)
    useSettings.getState().set({ letterSpacing: 0 })
  })
})

describe("the fonts the picker offers", () => {
  it("bundles Geist Mono", () => {
    expect(BUNDLED_FONTS).toContain("Geist Mono")
  })

  it("keeps the shipped and the conditional faces apart", () => {
    // The old picker offered both kinds as if they were the same promise; five
    // of six silently fell back to the system mono. They are labelled
    // differently now, so the lists must not overlap.
    for (const font of SYSTEM_FONTS) {
      expect(BUNDLED_FONTS as readonly string[]).not.toContain(font)
    }
  })

  it("builds a stack that falls back to the platform's own mono", () => {
    expect(fontStack("Geist Mono")).toBe('"Geist Mono", ui-monospace, monospace')
  })

  it("recognises every offered face as a preset, and a typed name as not", () => {
    for (const font of [...BUNDLED_FONTS, ...SYSTEM_FONTS]) {
      expect(isPresetFont(fontStack(font)), font).toBe(true)
    }
    expect(isPresetFont(fontStack("Comic Code"))).toBe(false)
    expect(isPresetFont("")).toBe(false)
  })

  it("shows a stored stack as the bare family name", () => {
    expect(fontName(fontStack("IBM Plex Mono"))).toBe("IBM Plex Mono")
    expect(fontName("")).toBe("")
  })
})
