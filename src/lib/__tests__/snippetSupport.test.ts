/**
 * The editor-side gates.
 *
 * Reado is a read-first editor: a completion popup appearing where none used to
 * would be a behaviour change nobody asked for. Both of these return nothing at
 * all unless an installed extension actually covers the file's language, which
 * is the property worth pinning.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))

import type { InstalledExt } from "@/lib/api"
import { extRead } from "@/lib/api"
import { preloadLanguageConfigs } from "@/lib/extLanguages"
import { useMarketplace } from "@/lib/marketplace"
import { contributedLanguage, contributedSnippets } from "@/lib/snippetSupport"

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

describe("contributedSnippets", () => {
  it("adds nothing when no extension covers the language", () => {
    expect(contributedSnippets("src/a.ts")).toEqual([])
  })

  it("adds completion once one does", () => {
    install(ext({ snippets: [{ language: "typescript", path: "./s.json" }] }))
    expect(contributedSnippets("src/a.ts")).not.toEqual([])
  })

  it("stays out of a language nothing covers", () => {
    install(ext({ snippets: [{ language: "python", path: "./s.json" }] }))
    expect(contributedSnippets("src/a.ts")).toEqual([])
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
