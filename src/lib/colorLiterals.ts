/**
 * Colour literals in source text: finding them, and rewriting one in the format
 * the author used.
 *
 * The swatch itself needs no maths — a literal is valid CSS, so the browser
 * paints it. Conversion is only for the picker round-trip, and the rule there is
 * that a file keeps its own dialect: an `oklch()` token edited through the
 * picker comes back as `oklch()`, never as hex.
 */

/** The colour notations we recognise. */
export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch"

export interface ColorLiteral {
  /** Offset of the literal within the scanned text. */
  from: number
  to: number
  /** The literal exactly as written. Valid CSS, so it can paint a swatch. */
  text: string
  format: ColorFormat
}

/** Straight sRGB, 0-255, plus alpha 0-1. */
export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

// Ordered so the longer notations win: `rgba(` must be tried before `rgb(`.
const PATTERNS: Array<[ColorFormat, RegExp]> = [
  ["hex", /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g],
  ["oklch", /\boklch\(\s*[^)]{1,80}\)/g],
  ["rgb", /\brgba?\(\s*[^)]{1,80}\)/g],
  ["hsl", /\bhsla?\(\s*[^)]{1,80}\)/g],
]

/**
 * Every colour literal in `text`, in document order. Overlaps are impossible
 * (the notations are disjoint), so a single sort is enough.
 */
export function findColorLiterals(text: string): ColorLiteral[] {
  const out: ColorLiteral[] = []
  for (const [format, re] of PATTERNS) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      if (parseColorLiteral(m[0]) === null) continue // e.g. `rgb(var(--x))`
      out.push({ from: m.index, to: m.index + m[0].length, text: m[0], format })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const num = (s: string) => Number.parseFloat(s)

/** Read `<n>` or `<n>%` against a full-scale value. */
const scaled = (s: string, full: number) =>
  s.trim().endsWith("%") ? (num(s) / 100) * full : num(s)

/** Split the inside of `f(...)`, accepting both comma and space syntax. */
const args = (literal: string): string[] =>
  literal
    .slice(literal.indexOf("(") + 1, literal.lastIndexOf(")"))
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean)

/** A literal's colour as sRGB, or null when it isn't a plain colour (a nested
 *  `var()`, a relative-colour syntax, a channel we can't read). */
export function parseColorLiteral(literal: string): Rgb | null {
  const s = literal.trim()
  if (s.startsWith("#")) return parseHex(s)
  if (/^oklch\(/i.test(s)) return parseOklch(s)
  if (/^rgba?\(/i.test(s)) return parseRgb(s)
  if (/^hsla?\(/i.test(s)) return parseHsl(s)
  return null
}

function parseHex(s: string): Rgb | null {
  const h = s.slice(1)
  const wide = h.length <= 4 ? h.split("").map((c) => c + c) : h.match(/../g)
  if (!wide || wide.length < 3) return null
  const [r, g, b, a] = wide.map((p) => Number.parseInt(p, 16))
  if ([r, g, b].some(Number.isNaN)) return null
  return { r, g, b, a: a === undefined ? 1 : a / 255 }
}

function parseRgb(s: string): Rgb | null {
  const p = args(s)
  if (p.length < 3 || p.some((x) => !/^[-\d.%]+$/.test(x))) return null
  const [r, g, b] = p.slice(0, 3).map((x) => Math.round(scaled(x, 255)))
  if ([r, g, b].some(Number.isNaN)) return null
  return { r, g, b, a: p[3] === undefined ? 1 : clamp01(scaled(p[3], 1)) }
}

function parseHsl(s: string): Rgb | null {
  const p = args(s)
  if (p.length < 3 || p.some((x) => !/^[-\d.%degrad]+$/i.test(x))) return null
  const h = num(p[0]) / 360
  const sat = num(p[1]) / 100
  const l = num(p[2]) / 100
  if ([h, sat, l].some(Number.isNaN)) return null
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = sat * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return { r: f(0), g: f(8), b: f(4), a: p[3] === undefined ? 1 : clamp01(scaled(p[3], 1)) }
}

// ---- OKLCH ------------------------------------------------------------------
// Zag's colour utils (behind Ark's picker) handle hex/rgb/hsl but not oklch,
// which is the notation this project's own theme tokens are written in — so the
// conversion lives here. Björn Ottosson's Oklab, with the sRGB transfer function.

const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const ungamma = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Oklab → linear sRGB. */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** Linear sRGB → Oklab. */
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function parseOklch(s: string): Rgb | null {
  const p = args(s)
  if (p.length < 3 || p.some((x) => !/^[-\d.%degrad]+$/i.test(x))) return null
  const L = p[0].trim().endsWith("%") ? num(p[0]) / 100 : num(p[0])
  const C = p[1].trim().endsWith("%") ? (num(p[1]) / 100) * 0.4 : num(p[1])
  const H = (num(p[2]) * Math.PI) / 180
  if ([L, C, H].some(Number.isNaN)) return null
  const [lr, lg, lb] = oklabToLinear(L, C * Math.cos(H), C * Math.sin(H))
  // Out-of-gamut colours clip per channel: enough for a swatch and a round-trip,
  // and it keeps the hue rather than desaturating toward grey.
  return {
    r: Math.round(clamp01(gamma(lr)) * 255),
    g: Math.round(clamp01(gamma(lg)) * 255),
    b: Math.round(clamp01(gamma(lb)) * 255),
    a: p[3] === undefined ? 1 : clamp01(scaled(p[3], 1)),
  }
}

const round = (n: number, places: number) => Number(n.toFixed(places))

/** Write `rgb` back in `format` — the notation the source already used. */
export function formatColor(rgb: Rgb, format: ColorFormat): string {
  const { r, g, b, a } = rgb
  const alpha = round(clamp01(a), 3)
  switch (format) {
    case "hex": {
      const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0")
      return `#${hex(r)}${hex(g)}${hex(b)}${alpha < 1 ? hex(alpha * 255) : ""}`
    }
    case "rgb":
      return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`
    case "hsl": {
      const [h, s, l] = rgbToHsl(r, g, b)
      const body = `${round(h, 1)}, ${round(s, 1)}%, ${round(l, 1)}%`
      return alpha < 1 ? `hsla(${body}, ${alpha})` : `hsl(${body})`
    }
    case "oklch": {
      const [L, A, B] = linearToOklab(ungamma(r / 255), ungamma(g / 255), ungamma(b / 255))
      const C = Math.hypot(A, B)
      // A neutral has no meaningful hue; report 0 rather than atan2's noise.
      const H = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
      const body = `${round(L, 4)} ${round(C, 4)} ${round(H, 2)}`
      return alpha < 1 ? `oklch(${body} / ${alpha})` : `oklch(${body})`
    }
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [(((h * 60) % 360) + 360) % 360, s * 100, l * 100]
}
