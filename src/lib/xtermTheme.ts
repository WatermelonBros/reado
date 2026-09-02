/**
 * Build an xterm.js theme from Reado's CSS theme tokens.
 *
 * xterm needs concrete colour strings, not `oklch(var(--…))`, so we resolve each
 * token to its computed `rgb(...)` via a throwaway probe element. Called when a
 * terminal mounts (and can be re-applied on theme change).
 */
import type { ITheme } from "@xterm/xterm"

/** Resolve a CSS custom property to a concrete `rgb(...)` string. */
function resolve(varName: string): string {
  const probe = document.createElement("span")
  probe.style.color = `var(${varName})`
  probe.style.display = "none"
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color || "#000"
}

/**
 * The accent colour as `#RRGGBB` — the only format xterm decorations accept
 * (they parse no `rgb(…)`, and a webview may hand back `oklch(…)` besides).
 * A 1×1 canvas normalises whatever the token computes to; if that's blocked,
 * fall back to a blue that reads as a link in either theme.
 */
export function xtermLinkColor(): string {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return LINK_FALLBACK
    ctx.fillStyle = resolve("--accent")
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
  } catch {
    return LINK_FALLBACK
  }
}

const LINK_FALLBACK = "#4d9fff"

/** Last-resort stack if neither CSS custom property resolves. */
const CODE_FONT_FALLBACK = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace'

/**
 * Resolve the configured code font to a concrete font-family string for xterm.
 * Mirrors the editor's `var(--code-font, var(--font-code))`: prefer the user's
 * `--code-font` override, fall back to the default `--font-code` stack.
 */
export function xtermFontFamily(): string {
  const root = getComputedStyle(document.documentElement)
  const font =
    root.getPropertyValue("--code-font").trim() || root.getPropertyValue("--font-code").trim()
  return font || CODE_FONT_FALLBACK
}

export function xtermTheme(): ITheme {
  return {
    background: resolve("--bg"),
    foreground: resolve("--text"),
    cursor: resolve("--accent"),
    cursorAccent: resolve("--bg"),
    selectionBackground: resolve("--selection"),
    black: resolve("--bg-elevated"),
    red: resolve("--marker"),
    green: resolve("--syn-string"),
    yellow: resolve("--syn-number"),
    blue: resolve("--syn-keyword"),
    magenta: resolve("--syn-control"),
    cyan: resolve("--accent"),
    white: resolve("--text-muted"),
    brightBlack: resolve("--text-faint"),
    brightRed: resolve("--marker"),
    brightGreen: resolve("--syn-string"),
    brightYellow: resolve("--syn-number"),
    brightBlue: resolve("--syn-keyword"),
    brightMagenta: resolve("--syn-control"),
    brightCyan: resolve("--accent"),
    brightWhite: resolve("--text"),
  }
}
