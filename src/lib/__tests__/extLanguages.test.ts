/** A contributed language configuration is a JSON description of syntax. What
 *  matters is that it lands in the shape CodeMirror's own commands read. */
import { describe, expect, it } from "vitest"
import type { InstalledExt } from "@/lib/api"
import { contributedLanguageIds, toLanguageData } from "@/lib/extLanguages"

const ext = (languages: unknown): InstalledExt => ({
  id: "Pub.lang",
  namespace: "Pub",
  name: "lang",
  version: "1.0.0",
  displayName: "Lang",
  manifest: { contributes: { languages } as Record<string, unknown> },
})

describe("contributedLanguageIds", () => {
  it("maps file extensions to the contributed language id, dot or no dot", () => {
    const map = contributedLanguageIds([ext([{ id: "nix", extensions: [".nix", "nixfile"] }])])
    expect(map).toEqual({ nix: "nix", nixfile: "nix" })
  })

  it("ignores a contribution with no id", () => {
    expect(contributedLanguageIds([ext([{ extensions: [".x"] }])])).toEqual({})
  })
})

describe("toLanguageData", () => {
  it("produces the comment tokens toggleComment reads", () => {
    const data = toLanguageData({
      comments: { lineComment: "#", blockComment: ["/*", "*/"] },
    })
    expect(data.commentTokens).toEqual({ line: "#", block: { open: "/*", close: "*/" } })
  })

  it("omits comment tokens entirely when the language declares none", () => {
    // An empty `commentTokens` would make toggleComment think it can comment.
    expect(toLanguageData({ brackets: [["{", "}"]] }).commentTokens).toBeUndefined()
  })

  it("reads auto-closing pairs in both published shapes", () => {
    const data = toLanguageData({
      autoClosingPairs: [["{", "}"], { open: "'", close: "'" }, { close: ")" }],
    })
    // The third has no opening character and contributes nothing.
    expect(data.closeBrackets).toEqual({ brackets: ["{", "'"] })
  })

  it("returns nothing usable for an empty configuration", () => {
    expect(toLanguageData({})).toEqual({})
  })
})
