/**
 * The editor-side completion and language gates.
 *
 * Completion is available in every file — a document's own words are the only
 * suggestions a file with no language server can get — and it now offers itself
 * as you type, which is the setting pinned here.
 *
 * The other property pinned here is that sources are registered through
 * `languageData` rather than `override`: `override` replaces every source, and
 * the language server registers its completions the same way, so an `override`
 * silently drops server completions in any file that also has snippets.
 */
import type { CompletionSource } from "@codemirror/autocomplete"
import { EditorState } from "@codemirror/state"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn(), readReadoFile: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))
const lspAttached = vi.fn(() => false)
// Only the attach check is faked; the rest of the module is real, and other
// code under test reaches for `langIdFor`.
vi.mock("@/lib/lsp", async (orig) => ({
  ...(await orig<typeof import("@/lib/lsp")>()),
  lspAttached: () => lspAttached(),
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
  lspAttached.mockReturnValue(false)
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

  it("suggests as you type, which the reader can switch off", () => {
    // This used to default to off — read-first taken to mean the editor should
    // not offer anything until asked. It reads as a broken editor instead: you
    // type a name that needs an import and nothing at all happens, with no way
    // to tell a quiet editor from a dead one. Read-first is about the default
    // *view*; while you are typing, an editor that suggests nothing is empty.
    expect(useSettings.getState().suggestOnTyping).toBe(true)
  })
})

describe("the document's own words", () => {
  /** Ask the word source at the end of `doc`, as CodeMirror would. */
  const ask = (doc: string) => {
    const state = EditorState.create({ doc, extensions: contributedSnippets("src/a.ts") })
    const pos = state.doc.length
    const [, word] = state.languageDataAt<CompletionSource>("autocomplete", pos)
    return word(fakeContext(state, pos))
  }

  /** Enough of a CompletionContext for `completeAnyWord`. */
  const fakeContext = (state: EditorState, pos: number) =>
    ({
      state,
      pos,
      explicit: true,
      view: {} as never,
      matchBefore(re: RegExp) {
        const line = state.doc.lineAt(pos)
        const text = state.sliceDoc(line.from, pos)
        const found = text.search(new RegExp(`${re.source}$`))
        return found < 0 ? null : { from: line.from + found, to: pos, text: text.slice(found) }
      },
    }) as unknown as Parameters<CompletionSource>[0]

  it("is what a file with no language server completes from", async () => {
    // Most languages have no server, and every file has seconds before one
    // attaches. Neither should mean the editor suggests nothing at all.
    const result = await ask("interestingName = 1\nconst x = intere")
    expect(result?.options.map((o) => o.label)).toContain("interestingName")
  })

  it("stands down once a language server is attached", async () => {
    // The server's list is the better answer; both at once names everything twice.
    lspAttached.mockReturnValue(true)
    expect(await ask("interestingName = 1\nconst x = intere")).toBeNull()
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
