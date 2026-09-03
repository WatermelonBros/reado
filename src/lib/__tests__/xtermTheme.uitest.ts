// Resolving Reado's CSS tokens into the concrete colours xterm.js needs.
import { afterEach, describe, expect, it, vi } from "vitest"
import { xtermFontFamily, xtermLinkColor, xtermTheme } from "@/lib/xtermTheme"

const TOKENS = [
  "--code-font",
  "--font-code",
  "--bg",
  "--text",
  "--accent",
  "--selection",
  "--bg-elevated",
  "--marker",
  "--syn-string",
  "--syn-number",
  "--syn-keyword",
  "--syn-control",
  "--text-muted",
  "--text-faint",
]
afterEach(() => {
  for (const t of TOKENS) document.documentElement.style.removeProperty(t)
  vi.restoreAllMocks()
})

/** happy-dom has no 2D context, so the canvas round-trip is stubbed with one
 *  that reports a fixed pixel. The stub is returned so a test can also assert
 *  *what was sampled* — otherwise the hex is purely the stub's own value. */
const stubCanvas = (pixel: number[] | null) => {
  const ctx = { fillStyle: "", fillRect: vi.fn(), getImageData: () => ({ data: pixel }) }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    pixel ? (ctx as unknown as CanvasRenderingContext2D) : null,
  )
  return ctx
}

describe("xtermFontFamily", () => {
  it("prefers the user's --code-font override", () => {
    document.documentElement.style.setProperty("--code-font", "Fira Code")
    document.documentElement.style.setProperty("--font-code", "Geist Mono")
    expect(xtermFontFamily()).toBe("Fira Code")
  })

  it("falls back to the theme's --font-code stack", () => {
    document.documentElement.style.setProperty("--font-code", "Geist Mono")
    expect(xtermFontFamily()).toBe("Geist Mono")
  })

  it("falls back to a monospace stack when neither token resolves", () => {
    expect(xtermFontFamily()).toContain("monospace")
  })
})

describe("xtermLinkColor", () => {
  it("samples the accent token and renders it as #RRGGBB, zero-padded", () => {
    document.documentElement.style.setProperty("--accent", "rgb(7, 8, 9)")
    const ctx = stubCanvas([1, 2, 255, 255])
    expect(xtermLinkColor()).toBe("#0102ff")
    // Without this the test passes for a link colour sampled from any token.
    expect(ctx.fillStyle).toBe("rgb(7, 8, 9)")
  })

  it("falls back to a readable blue when the canvas is blocked", () => {
    stubCanvas(null)
    expect(xtermLinkColor()).toBe("#4d9fff")
  })
})

describe("xtermTheme", () => {
  it("maps every slot to its own token, sharing one token across the bright pair", () => {
    // Every token distinct, and every slot asserted: a `toMatchObject` over a
    // handful leaves the rest free to point anywhere.
    const c: Record<string, string> = {}
    TOKENS.slice(2).forEach((tok, i) => {
      c[tok] = `rgb(${i + 1}, ${i + 1}, ${i + 1})`
      document.documentElement.style.setProperty(tok, c[tok])
    })
    expect(xtermTheme()).toEqual({
      background: c["--bg"],
      foreground: c["--text"],
      cursor: c["--accent"],
      cursorAccent: c["--bg"],
      selectionBackground: c["--selection"],
      black: c["--bg-elevated"],
      red: c["--marker"],
      green: c["--syn-string"],
      yellow: c["--syn-number"],
      blue: c["--syn-keyword"],
      magenta: c["--syn-control"],
      cyan: c["--accent"],
      white: c["--text-muted"],
      brightBlack: c["--text-faint"],
      brightRed: c["--marker"],
      brightGreen: c["--syn-string"],
      brightYellow: c["--syn-number"],
      brightBlue: c["--syn-keyword"],
      brightMagenta: c["--syn-control"],
      brightCyan: c["--accent"],
      brightWhite: c["--text"],
    })
  })

  it("covers background, foreground, cursor, selection and all 16 colours", () => {
    // By name, not by count: a slot renamed to something xterm ignores keeps
    // the count at 21 and silently stops applying.
    expect(Object.keys(xtermTheme()).sort()).toEqual([
      "background",
      "black",
      "blue",
      "brightBlack",
      "brightBlue",
      "brightCyan",
      "brightGreen",
      "brightMagenta",
      "brightRed",
      "brightWhite",
      "brightYellow",
      "cursor",
      "cursorAccent",
      "cyan",
      "foreground",
      "green",
      "magenta",
      "red",
      "selectionBackground",
      "white",
      "yellow",
    ])
  })

  it("leaves no probe elements behind", () => {
    const before = document.body.childElementCount
    xtermTheme()
    expect(document.body.childElementCount).toBe(before)
  })
})
