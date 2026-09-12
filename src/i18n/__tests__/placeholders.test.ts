// Every `t("key", { … })` call site against the placeholders its string declares.
//
// The bug this exists for: the commit graph's header read "{n} commit" in the
// running app, because the count was passed as `count` while the string said
// `{n}`. Nothing failed — i18next leaves an unknown placeholder standing,
// TypeScript checks the key and not the variables, and the string only appears
// once that panel is open. A whole class of defect invisible to every other
// check we run.
//
// Sources come through Vite's `?raw` rather than `node:fs`, the way
// `settingsIndex.test.ts` reads the tab it checks: no node types, no path
// juggling, and the glob is resolved at build time.
import { describe, expect, it } from "vitest"

import en from "@/i18n/locales/en.json"

const SOURCES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

/** The placeholders a message declares, e.g. `{name}` → "name". */
function declared(message: string): Set<string> {
  return new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

/** Resolve a dotted key against the locale. */
function lookup(key: string): string | undefined {
  let node: unknown = en
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

/**
 * `t("some.key", { a: x, b: y })` → the key and the names passed.
 *
 * Deliberately shallow: it reads the object literal's top-level names by
 * scanning to the matching brace, which is what every call site in this codebase
 * looks like. This is a tripwire, not a type system — a call it cannot parse
 * contributes nothing rather than a guess.
 */
function callSites(source: string): Array<{ key: string; vars: Set<string> }> {
  const out: Array<{ key: string; vars: Set<string> }> = []
  for (const m of source.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*\{/g)) {
    const start = (m.index ?? 0) + m[0].length
    let depth = 1
    let i = start
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++
      else if (source[i] === "}") depth--
      i++
    }
    const vars = new Set<string>()
    // Split on the commas that separate top-level properties only.
    for (const part of source.slice(start, i - 1).split(/,(?![^{[]*[}\]])/)) {
      const name = /^\s*(\w+)\s*[:,]?/.exec(part)?.[1]
      if (name) vars.add(name)
    }
    out.push({ key: m[1], vars })
  }
  return out
}

describe("interpolation", () => {
  it("passes every placeholder each message declares", () => {
    const problems: string[] = []
    for (const [file, source] of Object.entries(SOURCES)) {
      if (file.includes("__tests__")) continue
      for (const { key, vars } of callSites(source)) {
        const message = lookup(key)
        // An unknown key is the typed `MessageKey`'s job, not this test's.
        if (message === undefined) continue
        for (const name of declared(message)) {
          if (!vars.has(name)) {
            problems.push(`${file}: t("${key}") needs {${name}}, got {${[...vars].join(", ")}}`)
          }
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([])
  })

  it("finds the call sites it is supposed to check", () => {
    // A scanner that matches nothing would pass the check above forever.
    const found = Object.values(SOURCES).flatMap(callSites)
    expect(found.length).toBeGreaterThan(30)
  })

  it("catches a mismatch when there is one", () => {
    // The graph header's real bug, in miniature.
    const [site] = callSites('const x = t("gitGraph.count", { count: n })')
    expect(site.key).toBe("gitGraph.count")
    expect(declared(lookup(site.key) ?? "").has("n")).toBe(true)
    expect(site.vars.has("n")).toBe(false)
  })
})
