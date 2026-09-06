/**
 * The grammar layer's decisions that don't need the engine: which extension owns
 * a scope, and what colour a token's scopes earn.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/marketplace", () => ({
  useMarketplace: { getState: () => ({ installed: [] }) },
  enabledExtensions: (list: unknown[]) => list,
}))
vi.mock("@/lib/extThemes", () => ({ themeForegroundForScopes: () => themed }))

let themed: string | undefined

import type { InstalledExt } from "@/lib/api"
import { colorForScopes, grammarIndex, scopeForLanguage } from "@/lib/extGrammars"

const ext = (grammars: unknown, id = "Pub.g"): InstalledExt => ({
  id,
  namespace: "Pub",
  name: "g",
  version: "1.0.0",
  displayName: "G",
  manifest: { contributes: { grammars } as Record<string, unknown> },
})

describe("grammarIndex", () => {
  it("indexes contributed grammars by scope name", () => {
    const index = grammarIndex([
      ext([{ language: "nix", scopeName: "source.nix", path: "./nix.json" }]),
    ])
    expect(index.get("source.nix")?.path).toBe("./nix.json")
  })

  it("skips a grammar missing its scope or its file", () => {
    const index = grammarIndex([ext([{ language: "x", path: "./x.json" }, { scopeName: "s.y" }])])
    expect(index.size).toBe(0)
  })
})

describe("scopeForLanguage", () => {
  it("finds the root scope a language claims", () => {
    const installed = [ext([{ language: "nix", scopeName: "source.nix", path: "./n.json" }])]
    expect(scopeForLanguage(installed, "nix")).toBe("source.nix")
    expect(scopeForLanguage(installed, "rust")).toBeNull()
  })
})

describe("colorForScopes", () => {
  it("maps a token to Reado's own palette when no contributed theme is active", () => {
    themed = undefined
    expect(colorForScopes(["source.ts", "comment.line.double-slash.ts"])).toBe("var(--syn-comment)")
    expect(colorForScopes(["source.ts", "string.quoted.double.ts"])).toBe("var(--syn-string)")
    expect(colorForScopes(["source.ts", "constant.numeric.decimal.ts"])).toBe("var(--syn-number)")
  })

  it("prefers the innermost scope, not the outermost", () => {
    // `source.ts` sits outermost on every token; reading outside-in would paint
    // the whole file one colour.
    themed = undefined
    expect(colorForScopes(["source.ts", "keyword.control.flow.ts"])).toBe("var(--syn-control)")
    expect(colorForScopes(["source.ts", "keyword.operator.assignment.ts"])).toBe(
      "var(--syn-punctuation)",
    )
  })

  it("leaves a scope it has no role for uncoloured", () => {
    themed = undefined
    expect(colorForScopes(["source.ts", "meta.block.ts"])).toBeNull()
  })

  it("lets an active contributed theme's own rule win", () => {
    themed = "#ff0088"
    expect(colorForScopes(["source.ts", "comment.line.ts"])).toBe("#ff0088")
  })
})

describe("grammarSupport", () => {
  it("answers null for a language nothing contributes a grammar for", async () => {
    // The engine is a WebAssembly module: it must not be loaded to find that out.
    const { grammarSupport, hasGrammar, forgetGrammars } = await import("@/lib/extGrammars")
    expect(hasGrammar("rust")).toBe(false)
    expect(await grammarSupport("rust")).toBeNull()
    expect(() => forgetGrammars()).not.toThrow()
  })
})

describe("grammarIndex, further", () => {
  it("keeps the last extension to claim a scope, rather than crashing on a clash", () => {
    const index = grammarIndex([
      ext([{ language: "nix", scopeName: "source.nix", path: "./a.json" }], "A.a"),
      ext([{ language: "nix", scopeName: "source.nix", path: "./b.json" }], "B.b"),
    ])
    expect(index.size).toBe(1)
    expect(index.get("source.nix")?.path).toBe("./b.json")
  })

  it("is empty for an extension contributing no grammars at all", () => {
    expect(grammarIndex([ext(undefined, "C.c")]).size).toBe(0)
  })

  it("takes the first language match when an extension declares several", () => {
    const installed = [
      ext(
        [
          { language: "nix", scopeName: "source.nix", path: "./n.json" },
          { language: "dhall", scopeName: "source.dhall", path: "./d.json" },
        ],
        "D.d",
      ),
    ]
    expect(scopeForLanguage(installed, "dhall")).toBe("source.dhall")
  })
})
