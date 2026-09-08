// `.reado/snippets.json` — the snippets a project ships with its code. The
// format is VS Code's, deliberately, so one file serves both editors; what is
// pinned here is that Reado reads that format faithfully and that one bad entry
// never costs the project the rest of the file.
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ readReadoFile: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  safeError: (e: unknown) => String(e),
}))

import { parseSnippets } from "@/lib/userSnippets"

const CTX = { fileName: "a.ts", directory: "src" }
const parse = (obj: unknown, lang = "typescript") => parseSnippets(JSON.stringify(obj), lang, CTX)

describe("parseSnippets", () => {
  it("reads a VS Code snippet, joining an array body into one template", () => {
    const [snippet] = parse({
      "Log to console": {
        prefix: "log",
        body: ["console.log('$1')", "$0"],
        description: "Log output",
      },
    })
    expect(snippet.label).toBe("log")
    expect(snippet.detail).toBe("Log output")
  })

  it("registers one completion per prefix when a snippet declares several", () => {
    expect(parse({ S: { prefix: ["log", "cl"], body: "x" } }).map((c) => c.label)).toEqual([
      "log",
      "cl",
    ])
  })

  it("falls back to the snippet's name when it declares no prefix", () => {
    expect(parse({ log: { body: "x" } })[0].label).toBe("log")
  })

  it("honours `scope`, and treats its absence as every language", () => {
    const scoped = { S: { prefix: "s", body: "x", scope: "python, rust" } }
    expect(parse(scoped, "typescript")).toEqual([])
    expect(parse(scoped, "python")).toHaveLength(1)
    expect(parse({ S: { prefix: "s", body: "x" } }, "anything")).toHaveLength(1)
  })

  it("skips a malformed entry and keeps the rest of the file", () => {
    // One snippet with no body must not take the other two with it.
    const out = parse({
      ok: { prefix: "a", body: "x" },
      broken: { prefix: "b" },
      alsoOk: { prefix: "c", body: "y" },
    })
    expect(out.map((c) => c.label)).toEqual(["a", "c"])
  })

  it("returns nothing for a file that isn't a JSON object", () => {
    expect(parseSnippets("{ not json", "typescript", CTX)).toEqual([])
    expect(parseSnippets("[]", "typescript", CTX)).toEqual([])
    expect(parseSnippets("null", "typescript", CTX)).toEqual([])
  })
})
