/**
 * The index is a hand-kept map from control to tab and section, and the way it
 * fails is drift: a control moves, the entry doesn't, and search sends you to
 * the wrong tab. These checks make that a test failure rather than a bug report.
 */
import { describe, expect, it } from "vitest"
// The tab components' own source, so the index can be checked against what is
// actually rendered rather than against another list.
import settingsSource from "@/components/organisms/Settings.tsx?raw"
import { findSettings, SETTINGS_INDEX } from "@/components/organisms/settingsIndex"
import en from "@/i18n/locales/en.json"
import itLocale from "@/i18n/locales/it.json"

// The locale has nested groups too, so the cast goes through `unknown`.
type Dict = Record<string, string | undefined>
const dict = (o: object) => o as unknown as Dict
const it_ = itLocale
/** Resolve a dotted i18n key against a locale — the index names controls from
 *  more than one namespace, so "strip `settings.`" is not enough. */
const lookup = (locale: object, key: string): string | undefined => {
  const [ns, name] = key.split(".")
  return dict((locale as Record<string, object>)[ns] ?? {})[name]
}
const label = (key: string) => lookup(en, key) ?? key

describe("the settings index", () => {
  it("names a real string for every control and section", () => {
    for (const entry of SETTINGS_INDEX) {
      expect(lookup(en, entry.key), `missing en label for ${entry.key}`).toBeTruthy()
      expect(lookup(it_, entry.key), `missing it label for ${entry.key}`).toBeTruthy()
      expect(lookup(en, entry.sectionKey), `missing en title for ${entry.sectionKey}`).toBeTruthy()
    }
  })

  it("lists each control once", () => {
    const keys = SETTINGS_INDEX.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("keeps every section inside one tab", () => {
    // A section rendered under two tabs would make "Tab › Section" a lie.
    const owner = new Map<string, string>()
    for (const e of SETTINGS_INDEX) {
      const seen = owner.get(e.section)
      expect(seen ?? e.tab, `section ${e.section} spans tabs`).toBe(e.tab)
      owner.set(e.section, e.tab)
    }
  })
})

describe("findSettings", () => {
  it("finds a setting by the start of its name, first", () => {
    const hits = findSettings("line", label)
    expect(hits.length).toBeGreaterThan(0)
    expect(label(hits[0].key).toLowerCase().startsWith("line")).toBe(true)
  })

  it("finds one by a word inside its name", () => {
    expect(findSettings("whitespace", label).map((h) => h.key)).toContain(
      "settings.renderWhitespace",
    )
  })

  it("answers nothing for an empty query, rather than everything", () => {
    expect(findSettings("   ", label)).toEqual([])
  })

  it("returns nothing for a query that matches nothing", () => {
    expect(findSettings("zzzzzz", label)).toEqual([])
  })

  it("caps the list so the dropdown stays readable", () => {
    expect(findSettings("e", label).length).toBeLessThanOrEqual(8)
  })
})

describe("the index against the tabs it describes", () => {
  it("names every setting the tabs actually render, and no others", () => {
    // The docstring on settingsIndex.ts promises this check. Without it a
    // control could move tabs, or arrive with no entry, and search would send
    // you somewhere else while every other assertion stayed green.
    // Every key the file passes as a control label. Not just `settings.*`: a
    // control is free to borrow a label from another namespace — sticky scroll
    // uses `editor.sticky` — and a namespace-limited pattern here is how one
    // slipped past this very check and out of the index, unfindable by search.
    const rendered = new Set(
      // `aria-label` is deliberately excluded: the search field's own label is
      // not a setting.
      [...settingsSource.matchAll(/(?<!aria-)label=\{t\("([\w]+\.\w+)"\)/g)].map((m) => m[1]),
    )
    // Chrome, not settings: the header's own controls live in the same file.
    // `settings.json` opens the text view of everything — it is a way to reach
    // the settings, not one of them.
    const CHROME = new Set(["settings.close", "settings.title", "settings.json"])
    const indexed = new Set<string>(SETTINGS_INDEX.map((e) => e.key))

    // A rendered control with no entry is unfindable by search.
    const unindexed = [...rendered].filter((k) => !indexed.has(k) && !CHROME.has(k))
    expect(unindexed, "rendered but missing from SETTINGS_INDEX").toEqual([])
  })

  it("finds a setting by the name it has in the JSON view", () => {
    // Search matched only the translated label, so the name the user actually
    // knows — the one in Settings (JSON) one button away, and in every doc —
    // found nothing. In a localised UI that left no way in at all.
    const hits = findSettings("formatOnSave", label as never)
    expect(hits.map((h) => h.key)).toContain("settings.formatOnSave")
  })

  it("still finds a setting by its translated label", () => {
    const t = (k: string) => (k === "settings.fontSize" ? "Dimensione del carattere" : k)
    expect(findSettings("dimensione", t as never).map((h) => h.key)).toContain("settings.fontSize")
  })

  it("can reach the aids toggles that had no index entry at all", () => {
    // Word wrap, sticky scroll, focus mode and the structure ribbon label
    // themselves from `editor.*`, were absent from the index, and so could not
    // be found by any query in any language.
    for (const [q, key] of [
      ["wrap", "editor.wrap"],
      ["sticky", "editor.sticky"],
      ["focus", "editor.focus"],
      ["ribbon", "editor.ribbon"],
    ] as const) {
      expect(
        findSettings(q, label as never).map((h) => h.key),
        `searching "${q}"`,
      ).toContain(key)
    }
  })
})
