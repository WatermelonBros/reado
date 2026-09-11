// Every shipped locale must carry the same keys as English, with the same
// placeholders. TypeScript checks the keys a *component* uses; nothing checks
// the files, so a missing key silently falls back to English and a dropped
// `{name}` prints a sentence with a hole in it.
import { describe, expect, it } from "vitest"
import { LOCALES } from "@/i18n"

type Tree = { [key: string]: string | Tree }

/** Every dotted leaf path in a message tree, with its string. */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [k, v] of leaves(value, path)) out.set(k, v)
  }
  return out
}

/** The `{placeholders}` a string interpolates, as a sorted list. */
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const english = leaves(LOCALES[0].messages as Tree)

describe("the shipped locales", () => {
  it("ships English first — it is the fallback and the source of truth", () => {
    expect(LOCALES[0].code).toBe("en")
    expect(LOCALES.map((l) => l.code)).toEqual([...new Set(LOCALES.map((l) => l.code))])
  })

  for (const locale of LOCALES.slice(1)) {
    describe(locale.code, () => {
      const messages = leaves(locale.messages as Tree)

      it("has every key English has, and no others", () => {
        const missing = [...english.keys()].filter((k) => !messages.has(k))
        const extra = [...messages.keys()].filter((k) => !english.has(k))
        expect(missing, `missing from ${locale.code}.json`).toEqual([])
        expect(extra, "not in en.json").toEqual([])
      })

      it("keeps every placeholder", () => {
        const broken = [...english].filter(([key, text]) => {
          const translated = messages.get(key)
          return translated && placeholders(translated).join() !== placeholders(text).join()
        })
        expect(
          broken.map(([k]) => k),
          `placeholders differ in ${locale.code}.json`,
        ).toEqual([])
      })

      it("is actually translated, not a copy of English", () => {
        // Some strings are legitimately identical (product names, "OK"), but a
        // file that is mostly English is a file nobody translated.
        const same = [...english].filter(([key, text]) => messages.get(key) === text)
        expect(same.length / english.size).toBeLessThan(0.5)
      })
    })
  }
})
