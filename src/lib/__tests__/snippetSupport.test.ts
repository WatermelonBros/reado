/**
 * The editor-side completion and language gates.
 *
 * Reado is a read-first editor: a completion popup appearing while you type
 * would be a behaviour change nobody asked for, so the quiet default is pinned
 * here — but completion itself is available in every file, because a document's
 * own words are the only suggestions a file with no language server can get.
 *
 * The other property pinned here is that sources are registered through
 * `languageData` rather than `override`: `override` replaces every source, and
 * the language server registers its completions the same way, so an `override`
 * silently drops server completions in any file that also has snippets.
 */
import { EditorState } from "@codemirror/state"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn(), readReadoFile: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))

import type { InstalledExt } from "@/lib/api"
import { extRead } from "@/lib/api"
import { preloadLanguageConfigs } from "@/lib/extLanguages"
import { useMarketplace } from "@/lib/marketplace"
import { contributedLanguage, contributedSnippets } from "@/lib/snippetSupport"
import { useSettings } from "@/lib/store"

let n = 0
const ext = (contributes: unknown): InstalledExt => ({
  id: `Pub.e${n++}`,
  namespace: "Pub",
  name: `e${n}`,
  version: "1.0.0",
  displayName: "E",
  manifest: { contributes: contributes as Record<string, unknown> },
})

const install = (...exts: InstalledExt[]) => useMarketplace.setState({ installed: exts })

beforeEach(() => {
  vi.mocked(extRead).mockReset()
  install()
})

/** The completion sources an editor built from `contributedSnippets` exposes. */
const sourcesFor = (path: string) =>
  EditorState.create({ extensions: contributedSnippets(path) }).languageDataAt<unknown>(
    "autocomplete",
    0,
  )

describe("contributedSnippets", () => {
  // Always present: the project's own `.reado/snippets.json` source (which
  // returns nothing when the project has no such file) and the word source.
  const BASE_SOURCES = 2

  it("offers the document's own words even where nothing covers the language", () => {
    expect(sourcesFor("src/a.ts")).toHaveLength(BASE_SOURCES)
  })

  it("adds the extension's snippets alongside them, not instead of them", () => {
    install(ext({ snippets: [{ language: "typescript", path: "./s.json" }] }))
    expect(sourcesFor("src/a.ts")).toHaveLength(BASE_SOURCES + 1)
  })

  it("leaves a language nothing covers with just the standing sources", () => {
    install(ext({ snippets: [{ language: "python", path: "./s.json" }] }))
    expect(sourcesFor("src/a.ts")).toHaveLength(BASE_SOURCES)
  })

  it("registers through languageData, so a language server's sources survive", () => {
    // The regression this guards: `autocompletion({ override })` wins globally,
    // and `serverCompletion()` publishes via languageData — so an override here
    // left LSP completion dead in every file with snippets.
    install(ext({ snippets: [{ language: "typescript", path: "./s.json" }] }))
    const state = EditorState.create({
      extensions: [
        contributedSnippets("src/a.ts"),
        EditorState.languageData.of(() => [{ autocomplete: () => null }]),
      ],
    })
    expect(state.languageDataAt<unknown>("autocomplete", 0)).toHaveLength(BASE_SOURCES + 2)
  })

  it("stays quiet while typing unless the reader asks for suggestions", () => {
    expect(useSettings.getState().suggestOnTyping).toBe(false)
  })
})

describe("contributedLanguage", () => {
  it("stays out of a file Reado already has a language pack for", async () => {
    // A pack's language data rides on a real syntax tree; a JSON description is
    // not an improvement on that.
    const e = ext({
      languages: [{ id: "typescript", extensions: [".ts"], configuration: "./c.json" }],
    })
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ comments: { lineComment: "//" } }))
    await preloadLanguageConfigs([e])
    install(e)
    expect(contributedLanguage("src/a.ts")).toEqual([])
  })

  it("supplies comment rules for a language only an extension describes", async () => {
    const e = ext({ languages: [{ id: "nix", extensions: [".nix"], configuration: "./c.json" }] })
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ comments: { lineComment: "#" } }))
    await preloadLanguageConfigs([e])
    install(e)
    expect(contributedLanguage("flake.nix")).not.toEqual([])
  })

  it("supplies nothing for a file nothing describes", () => {
    expect(contributedLanguage("a.unknownext")).toEqual([])
  })
})
