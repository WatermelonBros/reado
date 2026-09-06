/**
 * Importing a theme is a mapping between two palettes, and the failure modes are
 * quiet: a JSON dialect that doesn't parse, a scope selector matched too
 * loosely, a theme that only half-paints the interface.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn() }))
vi.mock("@/lib/marketplace", () => ({
  useMarketplace: { getState: () => ({ installed: [] }) },
  enabledExtensions: (list: unknown[]) => list,
}))

import type { InstalledExt } from "@/lib/api"
import { extRead } from "@/lib/api"
import {
  allExtThemes,
  contrastRatio,
  judge,
  loadExtTheme,
  loadExtThemePreviews,
  parseHex,
  parseJsonc,
  themesOf,
} from "@/lib/extThemes"

const ext = (contributes: unknown): InstalledExt => ({
  id: "Pub.thing",
  namespace: "Pub",
  name: "thing",
  version: "1.0.0",
  displayName: "Thing",
  manifest: { contributes: contributes as Record<string, unknown> },
})

describe("parseJsonc", () => {
  it("accepts the dialect these files are really written in", () => {
    // Published themes carry comments and trailing commas; a strict parse
    // rejects a large share of the registry.
    expect(
      parseJsonc(`{
        // a line comment
        "type": "dark", /* and a block one */
        "colors": { "editor.background": "#101010", },
      }`),
    ).toEqual({ type: "dark", colors: { "editor.background": "#101010" } })
  })

  it("does not mistake a slash inside a string for a comment", () => {
    expect(parseJsonc('{"url":"https://example.com/x","a":1}')).toEqual({
      url: "https://example.com/x",
      a: 1,
    })
  })

  it("keeps an escaped quote inside a string", () => {
    expect(parseJsonc('{"a":"say \\"hi\\""}')).toEqual({ a: 'say "hi"' })
  })
})

describe("themesOf", () => {
  it("gives every contributed theme a stable, namespaced id", () => {
    const themes = themesOf(ext({ themes: [{ label: "Dusk", path: "./dusk.json" }] }))
    expect(themes[0].id).toBe("ext:Pub.thing:Dusk")
    expect(themes[0].dark).toBe(true)
  })

  it("reads polarity from uiTheme", () => {
    const themes = themesOf(ext({ themes: [{ label: "Day", path: "./d.json", uiTheme: "vs" }] }))
    expect(themes[0].dark).toBe(false)
  })

  it("skips a contribution with no file", () => {
    expect(themesOf(ext({ themes: [{ label: "Broken" }] }))).toEqual([])
  })

  it("is empty for an extension contributing no themes", () => {
    expect(themesOf(ext({ snippets: [{}] }))).toEqual([])
  })
})

describe("loadExtTheme", () => {
  const theme = {
    id: "ext:Pub.thing:Dusk" as const,
    label: "Dusk",
    extId: "Pub.thing",
    namespace: "Pub",
    name: "thing",
    path: "themes/dusk.json",
    dark: true,
  }

  it("maps interface colours and syntax scopes onto Reado's tokens", async () => {
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        colors: { "editor.background": "#101418", "editor.foreground": "#e8e8e8" },
        tokenColors: [
          { scope: "comment", settings: { foreground: "#5a6572" } },
          { scope: ["string", "string.quoted"], settings: { foreground: "#98c379" } },
        ],
      }),
    )
    const resolved = await loadExtTheme(theme)
    expect(resolved.base).toBe("reado-dark")
    expect(resolved.tokens.bg).toBe("#101418")
    expect(resolved.tokens.text).toBe("#e8e8e8")
    // `#5a6572` measures 3.1:1 on this canvas — a comment nobody can read, and
    // the most common way an imported dark theme fails. It is lifted to clear
    // the floor, keeping its hue.
    expect(resolved.tokens["syn-comment"]).not.toBe("#5a6572")
    expect(contrastRatio(resolved.tokens["syn-comment"], "#101418")).toBeGreaterThanOrEqual(4.5)
    // One that already passes is left exactly as the author wrote it.
    expect(resolved.tokens["syn-string"]).toBe("#98c379")
  })

  it("derives the surfaces instead of copying them", async () => {
    // The bug this replaces: themes whose sidebar and editor share one
    // background left inputs on the same colour as the page, with a border you
    // couldn't see. Surfaces now step away from the canvas by a fixed
    // perceptual amount, in the canvas's own hue.
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        colors: {
          "editor.background": "#0d1117",
          "editor.foreground": "#e6edf3",
          "sideBar.background": "#0d1117",
        },
      }),
    )
    const { tokens } = await loadExtTheme(theme)
    expect(tokens["bg-elevated"]).not.toBe(tokens.bg)
    expect(tokens.border).not.toBe(tokens.bg)
    expect(contrastRatio(tokens.border, tokens.bg)).toBeGreaterThan(1.2)
  })

  it("solves secondary text for a contrast ratio rather than copying it", async () => {
    // `descriptionForeground` and `editorLineNumber.foreground` are recessive by
    // design in the editor they were written for; Reado reads them.
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        colors: {
          "editor.background": "#0d1117",
          "editor.foreground": "#e6edf3",
          descriptionForeground: "#484f58",
          "editorLineNumber.foreground": "#2f3742",
        },
      }),
    )
    const { tokens } = await loadExtTheme(theme)
    expect(contrastRatio(tokens["text-muted"], tokens.bg)).toBeGreaterThanOrEqual(6.5)
    expect(contrastRatio(tokens["text-faint"], tokens.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it("prefers the most specific scope selector", async () => {
    // A theme that styles `keyword` and `keyword.control` differently must not
    // have control flow painted with the general keyword colour.
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        tokenColors: [
          { scope: "keyword", settings: { foreground: "#111111" } },
          { scope: "keyword.control", settings: { foreground: "#222222" } },
        ],
      }),
    )
    const resolved = await loadExtTheme(theme)
    expect(resolved.tokens["syn-control"]).toBe("#222222")
    expect(resolved.tokens["syn-keyword"]).toBe("#111111")
  })

  it("leaves unmapped tokens absent so the built-in base supplies them", async () => {
    // A sparse theme must produce a coherent interface, not a half-painted one.
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ type: "light", colors: {} }))
    const resolved = await loadExtTheme(theme)
    expect(resolved.base).toBe("reado-light")
    expect(resolved.tokens.bg).toBeUndefined()
  })

  it("follows an include chain, with the variant winning", async () => {
    // Theme packs are commonly a base file plus thin variants on top.
    vi.mocked(extRead).mockImplementation(async (_ns, _n, path) =>
      path === "themes/dusk.json"
        ? JSON.stringify({ include: "./base.json", colors: { "editor.background": "#000000" } })
        : JSON.stringify({
            type: "dark",
            colors: { "editor.background": "#ffffff", "editor.foreground": "#cccccc" },
          }),
    )
    const resolved = await loadExtTheme(theme)
    expect(resolved.tokens.bg).toBe("#000000")
    expect(resolved.tokens.text).toBe("#cccccc")
  })
})

describe("contrast", () => {
  it("parses the hex forms themes actually use", () => {
    expect(parseHex("#fff")).toEqual([1, 1, 1])
    expect(parseHex("#ffffff")).toEqual([1, 1, 1])
    // Eight digits: alpha is dropped, the author's colour is what's judged.
    expect(parseHex("#000000ff")).toEqual([0, 0, 0])
    expect(parseHex("rgb(0,0,0)")).toBeNull()
  })

  it("measures black on white as the maximum ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1)
  })

  it("fails a theme below AA and passes one above it", () => {
    const fail = judge({
      base: "reado-dark",
      tokens: { text: "#777777", bg: "#666666" },
      tokenColors: [],
    })
    expect(fail.passes).toBe(false)
    const pass = judge({
      base: "reado-dark",
      tokens: { text: "#eeeeee", bg: "#111111" },
      tokenColors: [],
    })
    expect(pass.passes).toBe(true)
  })

  it("passes a theme that specified neither — the base already passes", () => {
    expect(judge({ base: "reado-dark", tokens: {}, tokenColors: [] })).toEqual({
      ratio: null,
      passes: true,
    })
  })
})

describe("theme discovery and application", () => {
  const installed = (contributes: unknown, id = "Pub.pack") => ({
    id,
    namespace: "Pub",
    name: "pack",
    version: "1.0.0",
    displayName: "Pack",
    manifest: { contributes: contributes as Record<string, unknown> },
  })

  it("gathers the themes of every installed extension", () => {
    const themes = allExtThemes([
      installed({ themes: [{ label: "One", path: "./1.json" }] }, "A.a"),
      installed({ themes: [{ label: "Two", path: "./2.json" }] }, "B.b"),
      installed({ snippets: [{}] }, "C.c"),
    ] as never)
    expect(themes.map((t) => t.label)).toEqual(["One", "Two"])
  })

  it("previews every theme it can load and drops the ones it can't", async () => {
    // One unreadable theme must not empty the picker.
    vi.mocked(extRead).mockImplementation(async (_ns, _n, path) =>
      path === "./bad.json"
        ? Promise.reject(new Error("gone"))
        : JSON.stringify({ type: "dark", colors: { "editor.background": "#101418" } }),
    )
    const previews = await loadExtThemePreviews([
      installed({ themes: [{ label: "Good", path: "./good.json" }] }, "A.a"),
      installed({ themes: [{ label: "Bad", path: "./bad.json" }] }, "B.b"),
    ] as never)
    expect(previews.map((p) => p.theme.label)).toEqual(["Good"])
    expect(previews[0].verdict.passes).toBe(true)
  })

  it("keeps the theme's own scope rules for grammar-highlighted files", async () => {
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        colors: { "editor.background": "#101418" },
        tokenColors: [{ scope: "keyword", settings: { foreground: "#ff8800" } }],
      }),
    )
    const resolved = await loadExtTheme({
      id: "ext:A.a:X",
      label: "X",
      extId: "A.a",
      namespace: "A",
      name: "a",
      path: "t.json",
      dark: true,
    })
    expect(resolved.tokenColors?.length).toBe(1)
  })

  it("lifts an accent that can't be read against the canvas", async () => {
    // An accent lands on buttons and links, which are text too.
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        type: "dark",
        colors: { "editor.background": "#101418", "textLink.foreground": "#1a1f26" },
      }),
    )
    const { tokens } = await loadExtTheme({
      id: "ext:A.a:Y",
      label: "Y",
      extId: "A.a",
      namespace: "A",
      name: "a",
      path: "t.json",
      dark: true,
    })
    expect(contrastRatio(tokens.accent, "#101418")).toBeGreaterThanOrEqual(3)
  })

  it("leaves the whole interface to the base when a theme names no canvas", async () => {
    // Nothing to derive from: the theme contributes only its palette.
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ type: "light", tokenColors: [] }))
    const { base, tokens } = await loadExtTheme({
      id: "ext:A.a:Z",
      label: "Z",
      extId: "A.a",
      namespace: "A",
      name: "a",
      path: "t.json",
      dark: false,
    })
    expect(base).toBe("reado-light")
    expect(tokens["bg-elevated"]).toBeUndefined()
  })
})
