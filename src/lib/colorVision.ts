/**
 * Palettes for readers who can't separate certain hues.
 *
 * These live here rather than in `tokens.css` because, unlike a theme, they are
 * a claim that can be checked: "is this pair still on the axis the reader can't
 * see?" is a question with an answer, and the tests ask it. They are applied as
 * inline custom properties on the root, which beat the stylesheet's, so a mode
 * *layers over* whichever theme is active instead of replacing it — someone can
 * have sepia and a diff they can read.
 *
 * Only the colours that carry meaning on their own are overridden. Source
 * Control already pairs its colours with letters, and comment types carry their
 * name; the diff and error-versus-warning are the places where a hue is the
 * whole signal.
 */

export type ColorVision = "normal" | "red-green" | "blue-yellow"

/** Hue angles the palettes are steered away from, in OKLCH degrees. */
export const AXIS = { green: 150, red: 25, blue: 250, yellow: 90 } as const

/** Distance between two hue angles, the short way round the circle. */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** The hue of an `oklch(L C H …)` value. */
export function hueOf(value: string): number {
  const inside = value
    .trim()
    .replace(/^oklch\(/, "")
    .replace(/\)$/, "")
  return Number(inside.split(/[\s/]+/)[2])
}

/** A token override set: lightness and chroma are chosen to keep a visible
 *  lightness gap between the pair, so the distinction survives greyscale too. */
type Palette = Record<string, string>

const PALETTES: Record<Exclude<ColorVision, "normal">, Palette> = {
  // Deuteranopia and protanopia both confuse red with green, so the pair moves
  // to blue against orange — separable for either, and far apart in lightness.
  "red-green": {
    "diff-add": "oklch(0.72 0.13 240)",
    "diff-del": "oklch(0.78 0.15 70)",
    // Error against warning is red against amber: the same confusion again.
    "diag-error": "oklch(0.62 0.19 25)",
    "diag-warn": "oklch(0.74 0.13 250)",
  },
  // Tritanopia sees red and green fine; it is blue against yellow that goes.
  "blue-yellow": {
    "diff-add": "oklch(0.7 0.15 150)",
    "diff-del": "oklch(0.62 0.19 15)",
    "diag-error": "oklch(0.62 0.19 15)",
    "diag-warn": "oklch(0.55 0.14 320)",
  },
}

/** The overrides for a mode, including the soft (translucent) companions the
 *  diff backgrounds use — derived, so a palette can't define one and forget the
 *  other. */
export function tokensFor(mode: ColorVision): Palette {
  if (mode === "normal") return {}
  const base = PALETTES[mode]
  const out: Palette = { ...base }
  for (const name of ["diff-add", "diff-del"]) {
    out[`${name}-soft`] = base[name].replace(/\)$/, " / 0.16)")
  }
  return out
}

/** Every token a mode may touch — what `useApplyColorVision` clears on the way
 *  back to "normal". */
export const OVERRIDDEN_TOKENS = Object.keys(tokensFor("red-green"))
