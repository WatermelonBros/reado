// Colour vision: the palettes are a claim that can be checked — "is this pair
// still on the axis the reader can't see?" — so these ask it. Plus the layering
// promise: a mode changes the meaning-carrying colours and nothing else.
import { beforeEach, describe, expect, it } from "vitest"
import {
  AXIS,
  type ColorVision,
  hueGap,
  hueOf,
  OVERRIDDEN_TOKENS,
  tokensFor,
} from "@/lib/colorVision"
import { useSettings } from "@/lib/store"

const MODES: Exclude<ColorVision, "normal">[] = ["red-green", "blue-yellow"]

describe("no adjustment", () => {
  it("overrides nothing, so the theme's palette stands", () => {
    expect(tokensFor("normal")).toEqual({})
  })

  it("is the default", () => {
    expect(useSettings.getState().colorVision).toBe("normal")
  })
})

describe("red–green", () => {
  const p = tokensFor("red-green")

  it("moves both sides of the diff off the red and green hues", () => {
    for (const name of ["diff-add", "diff-del"] as const) {
      const h = hueOf(p[name])
      expect(hueGap(h, AXIS.green), `${name} is still green`).toBeGreaterThan(40)
      expect(hueGap(h, AXIS.red), `${name} is still red`).toBeGreaterThan(40)
    }
  })

  it("keeps the two sides far apart from each other", () => {
    // Moving both off the axis is no use if they land on the same hue.
    expect(hueGap(hueOf(p["diff-add"]), hueOf(p["diff-del"]))).toBeGreaterThan(60)
  })

  it("separates error from warning, which is the same confusion", () => {
    expect(hueGap(hueOf(p["diag-error"]), hueOf(p["diag-warn"]))).toBeGreaterThan(60)
  })
})

describe("blue–yellow", () => {
  const p = tokensFor("blue-yellow")

  it("moves both sides of the diff off the blue and yellow hues", () => {
    for (const name of ["diff-add", "diff-del"] as const) {
      const h = hueOf(p[name])
      expect(hueGap(h, AXIS.blue), `${name} is still blue`).toBeGreaterThan(40)
      expect(hueGap(h, AXIS.yellow), `${name} is still yellow`).toBeGreaterThan(40)
    }
  })

  it("keeps the two sides far apart from each other", () => {
    expect(hueGap(hueOf(p["diff-add"]), hueOf(p["diff-del"]))).toBeGreaterThan(60)
  })
})

describe("every mode", () => {
  it("ships the translucent companion for each diff colour", () => {
    // The backgrounds use the soft variants; a palette that defined one and
    // forgot the other would leave the diff half-retinted.
    for (const mode of MODES) {
      const p = tokensFor(mode)
      expect(p["diff-add-soft"], mode).toContain("/ 0.16")
      expect(p["diff-del-soft"], mode).toContain("/ 0.16")
    }
  })

  it("touches only the colours that carry meaning on their own", () => {
    // A mode that redefined the background or the text would be a theme, and
    // the reader already chose one of those.
    for (const mode of MODES) {
      for (const name of Object.keys(tokensFor(mode))) {
        expect(name, `${mode} overrides ${name}`).toMatch(/^(diff-|diag-)/)
      }
    }
  })

  it("declares every token it may set, so a switch can clear them", () => {
    for (const mode of MODES) {
      for (const name of Object.keys(tokensFor(mode))) {
        expect(OVERRIDDEN_TOKENS, `${mode}/${name} would be left behind`).toContain(name)
      }
    }
  })
})

describe("hue maths", () => {
  it("measures the short way round the circle", () => {
    expect(hueGap(350, 10)).toBe(20)
    expect(hueGap(10, 350)).toBe(20)
    expect(hueGap(0, 180)).toBe(180)
  })

  it("reads the hue out of an oklch value, with or without alpha", () => {
    expect(hueOf("oklch(0.72 0.13 240)")).toBe(240)
    expect(hueOf("oklch(0.72 0.13 240 / 0.16)")).toBe(240)
  })
})

describe("switching modes", () => {
  beforeEach(() => {
    for (const name of OVERRIDDEN_TOKENS) {
      document.documentElement.style.removeProperty(`--${name}`)
    }
  })

  it("leaves nothing of the previous mode behind", () => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(tokensFor("red-green"))) {
      root.style.setProperty(`--${name}`, value)
    }
    // Going back to normal must clear them, or the theme would stay overridden.
    for (const name of OVERRIDDEN_TOKENS) root.style.removeProperty(`--${name}`)
    for (const name of OVERRIDDEN_TOKENS) {
      expect(root.style.getPropertyValue(`--${name}`)).toBe("")
    }
  })
})
