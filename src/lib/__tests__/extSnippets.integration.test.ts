// biome-ignore-all lint/suspicious/noTemplateCurlyInString: snippet bodies carry
// `${1:placeholder}` in plain strings — that is the format, not a stray template.

/**
 * Reading snippet files off an installed extension, and turning them into
 * completions. `toTemplate` is pinned separately; this covers the layer that
 * finds the files, scopes them to a language, and survives a broken one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))

import type { InstalledExt } from "@/lib/api"
import { extRead } from "@/lib/api"
import { hasSnippets, snippetsFor } from "@/lib/extSnippets"

let n = 0
/** Snippet files are cached per extension file, so each test brings its own. */
const ext = (snippets: unknown): InstalledExt => ({
  id: `Pub.snips${n++}`,
  namespace: "Pub",
  name: `snips${n}`,
  version: "1.0.0",
  displayName: "Snips",
  manifest: { contributes: { snippets } as Record<string, unknown> },
})

const TS_SNIPPETS = [{ language: "typescript", path: "./snippets/ts.json" }]
const ctx = { fileName: "a.ts", directory: "src" }

beforeEach(() => vi.mocked(extRead).mockReset())

describe("hasSnippets", () => {
  it("is true only for a language the extension actually names", () => {
    const e = ext(TS_SNIPPETS)
    expect(hasSnippets([e], "typescript")).toBe(true)
    expect(hasSnippets([e], "python")).toBe(false)
    expect(hasSnippets([], "typescript")).toBe(false)
  })

  it("ignores a contribution with no file", () => {
    expect(hasSnippets([ext([{ language: "typescript" }])], "typescript")).toBe(false)
  })
})

describe("snippetsFor", () => {
  it("turns each prefix into its own completion", async () => {
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({
        "For Loop": {
          prefix: ["for", "forof"],
          body: "for (const ${1:x} of ${2:xs}) {}",
          description: "Loop",
        },
      }),
    )
    const out = await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)
    expect(out.map((c) => c.label)).toEqual(["for", "forof"])
    expect(out[0].detail).toBe("Loop")
    expect(out[0].type).toBe("snippet")
  })

  it("falls back to the snippet's own name when it declares no prefix", async () => {
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ Banner: { body: "// hi" } }))
    const out = await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)
    expect(out.map((c) => c.label)).toEqual(["Banner"])
  })

  it("joins a body written as lines", async () => {
    vi.mocked(extRead).mockResolvedValue(
      JSON.stringify({ If: { prefix: "if", body: ["if (x) {", "\t$0", "}"] } }),
    )
    expect((await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)).length).toBe(1)
  })

  it("skips an entry with no body at all", async () => {
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ Empty: { prefix: "e" } }))
    expect(await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)).toEqual([])
  })

  it("offers nothing for a language the extension doesn't cover", async () => {
    expect(await snippetsFor([ext(TS_SNIPPETS)], "python", ctx)).toEqual([])
    expect(extRead).not.toHaveBeenCalled()
  })

  it("survives a snippet file that won't parse", async () => {
    // One broken file must not take the rest of the language's snippets with it.
    vi.mocked(extRead).mockImplementationOnce(() => Promise.resolve("{ not json"))
    expect(await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)).toEqual([])
  })

  it("accepts the comments these files are written with", async () => {
    vi.mocked(extRead).mockResolvedValue(
      '{\n // a note\n "If": { "prefix": "if", "body": "if" },\n}',
    )
    expect((await snippetsFor([ext(TS_SNIPPETS)], "typescript", ctx)).length).toBe(1)
  })

  it("gathers from every extension that covers the language", async () => {
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ A: { prefix: "a", body: "a" } }))
    const out = await snippetsFor([ext(TS_SNIPPETS), ext(TS_SNIPPETS)], "typescript", ctx)
    expect(out.length).toBe(2)
  })
})
