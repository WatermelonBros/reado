// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the rules under test contain a literal `${capture}` placeholder
// File nesting: which generated siblings tuck under the file that generated
// them. The rules are user-editable text, so parsing is forgiving; the grouping
// has to stay a list rather than becoming a graph, whatever the rules say.
import { describe, expect, it } from "vitest"
import type { DirEntry } from "@/lib/api"
import {
  DEFAULT_NESTING,
  type NestingRule,
  nestEntries,
  parseNestingRules,
} from "@/lib/fileNesting"

const file = (name: string): DirEntry => ({ name, path: `/p/${name}`, isDir: false })
const dir = (name: string): DirEntry => ({ name, path: `/p/${name}`, isDir: true })
const rules = (...lines: string[]) => parseNestingRules(lines)
const shape = (entries: DirEntry[], r: NestingRule[]) =>
  nestEntries(entries, r).map((n) => [n.entry.name, n.children.map((c) => c.name)] as const)

describe("parseNestingRules", () => {
  it("reads the `parent : child, child` form", () => {
    expect(rules("*.ts : ${capture}.js, ${capture}.d.ts")).toEqual([
      { parent: "*.ts", children: ["${capture}.js", "${capture}.d.ts"] },
    ])
  })

  it("skips a line that names no children instead of failing the list", () => {
    expect(rules("*.ts :", "broken", "package.json : package-lock.json")).toEqual([
      { parent: "package.json", children: ["package-lock.json"] },
    ])
  })

  it("parses everything Reado ships", () => {
    expect(parseNestingRules(DEFAULT_NESTING)).toHaveLength(DEFAULT_NESTING.length)
  })
})

describe("nestEntries", () => {
  it("tucks a generated sibling under the file that generated it", () => {
    const entries = [file("a.ts"), file("a.js"), file("b.ts")]
    expect(shape(entries, rules("*.ts : ${capture}.js"))).toEqual([
      ["a.ts", ["a.js"]],
      ["b.ts", []],
    ])
  })

  it("matches an exact parent name too, not only a star pattern", () => {
    const entries = [file("package.json"), file("package-lock.json")]
    expect(shape(entries, rules("package.json : package-lock.json"))).toEqual([
      ["package.json", ["package-lock.json"]],
    ])
  })

  it("leaves folders alone", () => {
    // A rule reaching a directory would hide a whole subtree.
    const entries = [dir("a.ts"), file("a.js")]
    expect(shape(entries, rules("*.ts : ${capture}.js"))).toEqual([
      ["a.ts", []],
      ["a.js", []],
    ])
  })

  it("never nests a file under something that is itself nested", () => {
    // `a.js` goes under `a.ts`; `a.js.map` must go under `a.ts` as well, not
    // under a row that isn't shown at the top level any more.
    const entries = [file("a.ts"), file("a.js"), file("a.js.map")]
    const r = rules("*.ts : ${capture}.js, ${capture}.js.map", "*.js : ${capture}.js.map")
    expect(shape(entries, r)).toEqual([["a.ts", ["a.js", "a.js.map"]]])
  })

  it("gives a file to the first parent that claims it", () => {
    // Two rules can both want the same child; the result has to stay a list.
    const entries = [file("a.ts"), file("a.tsx"), file("a.js")]
    const r = rules("*.ts : ${capture}.js", "*.tsx : ${capture}.js")
    const out = shape(entries, r)
    expect(out.flatMap(([, kids]) => kids)).toEqual(["a.js"])
  })

  it("never nests a file under itself", () => {
    const entries = [file("a.js")]
    expect(shape(entries, rules("*.js : ${capture}.js"))).toEqual([["a.js", []]])
  })

  it("passes everything through untouched when there are no rules", () => {
    const entries = [file("a.ts"), file("a.js")]
    expect(shape(entries, [])).toEqual([
      ["a.ts", []],
      ["a.js", []],
    ])
  })

  it("keeps the folder's own order", () => {
    const entries = [file("z.ts"), file("a.ts"), file("a.js")]
    expect(shape(entries, rules("*.ts : ${capture}.js")).map(([n]) => n)).toEqual(["z.ts", "a.ts"])
  })

  it("does the job Reado ships it for", () => {
    const entries = [
      file("package.json"),
      file("pnpm-lock.yaml"),
      file("index.ts"),
      file("index.js"),
      file("index.d.ts"),
      file("README.md"),
    ]
    expect(shape(entries, parseNestingRules(DEFAULT_NESTING))).toEqual([
      ["package.json", ["pnpm-lock.yaml"]],
      ["index.ts", ["index.js", "index.d.ts"]],
      ["README.md", []],
    ])
  })
})
