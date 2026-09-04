// Finding colour literals in source text, and rewriting one in the notation the
// author used. Pure — no DOM, runs on all three OSes.
import { describe, expect, it } from "vitest"
import {
  type ColorFormat,
  findColorLiterals,
  formatColor,
  parseColorLiteral,
  type Rgb,
} from "@/lib/colorLiterals"

const rgb = (r: number, g: number, b: number, a = 1): Rgb => ({ r, g, b, a })

describe("findColorLiterals", () => {
  it("finds each notation, in document order, with its own bounds", () => {
    const src = `--accent: oklch(0.74 0.11 260);\n--marker: #d94f4f;\ncolor: rgb(10, 20, 30);`
    const found = findColorLiterals(src)
    expect(found.map((c) => c.format)).toEqual(["oklch", "hex", "rgb"])
    expect(found.map((c) => c.text)).toEqual(["oklch(0.74 0.11 260)", "#d94f4f", "rgb(10, 20, 30)"])
    // The bounds must select exactly the literal — they drive both the swatch's
    // position and the range the picker rewrites.
    for (const c of found) expect(src.slice(c.from, c.to)).toBe(c.text)
  })

  it("takes the whole of rgba/hsla, not the rgb/hsl prefix", () => {
    const found = findColorLiterals("a: rgba(1,2,3,.5); b: hsla(10, 20%, 30%, .5)")
    expect(found.map((c) => c.text)).toEqual(["rgba(1,2,3,.5)", "hsla(10, 20%, 30%, .5)"])
  })

  it("ignores something shaped like a colour that isn't one", () => {
    // A nested var() has no value we can paint, and a bare word is not a hex.
    const found = findColorLiterals("a: rgb(var(--c)); b: #ghijkl; c: oklch(from red l c h)")
    expect(found).toEqual([])
  })

  it("finds nothing in ordinary prose", () => {
    expect(findColorLiterals("the quick brown fox #1 rgb of it")).toEqual([])
  })
})

describe("parseColorLiteral", () => {
  it("reads hex in its three lengths", () => {
    expect(parseColorLiteral("#f00")).toEqual(rgb(255, 0, 0))
    expect(parseColorLiteral("#ff0000")).toEqual(rgb(255, 0, 0))
    expect(parseColorLiteral("#ff000080")?.a).toBeCloseTo(0.502, 2)
  })

  it("reads rgb with numbers, percentages and an alpha", () => {
    expect(parseColorLiteral("rgb(10, 20, 30)")).toEqual(rgb(10, 20, 30))
    expect(parseColorLiteral("rgb(100%, 0%, 0%)")).toEqual(rgb(255, 0, 0))
    expect(parseColorLiteral("rgba(10 20 30 / 0.5)")).toEqual(rgb(10, 20, 30, 0.5))
  })

  it("reads hsl", () => {
    expect(parseColorLiteral("hsl(0, 100%, 50%)")).toEqual(rgb(255, 0, 0))
    expect(parseColorLiteral("hsl(120, 100%, 50%)")).toEqual(rgb(0, 255, 0))
  })

  it("reads oklch, including this project's own tokens", () => {
    // White and black are the two anchors the maths must not drift on.
    expect(parseColorLiteral("oklch(1 0 0)")).toEqual(rgb(255, 255, 255))
    expect(parseColorLiteral("oklch(0 0 0)")).toEqual(rgb(0, 0, 0))
    const accent = parseColorLiteral("oklch(0.74 0.11 260)")
    expect(accent).not.toBeNull()
    // A mid-lightness blue: blue is the dominant channel and it isn't grey.
    expect((accent as Rgb).b).toBeGreaterThan((accent as Rgb).r)
    expect((accent as Rgb).b - (accent as Rgb).r).toBeGreaterThan(30)
  })

  it("clips an out-of-gamut oklch instead of returning nonsense", () => {
    const c = parseColorLiteral("oklch(0.9 0.4 140)") as Rgb
    for (const ch of [c.r, c.g, c.b]) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(255)
    }
  })
})

describe("formatColor", () => {
  it("writes each notation the way that notation is written", () => {
    expect(formatColor(rgb(255, 0, 0), "hex")).toBe("#ff0000")
    expect(formatColor(rgb(10, 20, 30), "rgb")).toBe("rgb(10, 20, 30)")
    expect(formatColor(rgb(255, 0, 0), "hsl")).toBe("hsl(0, 100%, 50%)")
    expect(formatColor(rgb(255, 255, 255), "oklch")).toMatch(/^oklch\(1 0 0\)$/)
  })

  it("carries alpha through, and omits it when opaque", () => {
    expect(formatColor(rgb(255, 0, 0, 0.5), "hex")).toBe("#ff000080")
    expect(formatColor(rgb(1, 2, 3, 0.5), "rgb")).toBe("rgba(1, 2, 3, 0.5)")
    expect(formatColor(rgb(255, 0, 0, 0.5), "hsl")).toBe("hsla(0, 100%, 50%, 0.5)")
    expect(formatColor(rgb(0, 0, 0, 0.5), "oklch")).toBe("oklch(0 0 0 / 0.5)")
  })

  const FORMATS: ColorFormat[] = ["hex", "rgb", "hsl", "oklch"]
  it("round-trips a colour through every notation without drifting", () => {
    // The picker hands back sRGB; writing it as the source's own notation and
    // reading it again must land on the same colour, or a file would decay a
    // little on each edit.
    for (const format of FORMATS) {
      for (const c of [rgb(0, 0, 0), rgb(255, 255, 255), rgb(217, 79, 79), rgb(10, 20, 30)]) {
        const back = parseColorLiteral(formatColor(c, format)) as Rgb
        expect(back, `${format} round-trip of ${JSON.stringify(c)}`).not.toBeNull()
        expect(Math.abs(back.r - c.r), `${format} r`).toBeLessThanOrEqual(1)
        expect(Math.abs(back.g - c.g), `${format} g`).toBeLessThanOrEqual(1)
        expect(Math.abs(back.b - c.b), `${format} b`).toBeLessThanOrEqual(1)
      }
    }
  })

  it("keeps a neutral's hue at zero rather than atan2 noise", () => {
    expect(formatColor(rgb(128, 128, 128), "oklch")).toMatch(/ 0\)$/)
  })
})
