/**
 * Naming what an extension adds, in the product's own words rather than the
 * registry's key names. Shared by every row, whatever the kind came from.
 */
import type { TFunction } from "i18next"
import type { ContributionKind } from "@/lib/marketplace"

/** The i18n key naming each contribution kind, in the order they read best. */
const KIND_KEYS = {
  themes: "ext.kindThemes",
  iconThemes: "ext.kindIconThemes",
  snippets: "ext.kindSnippets",
  languages: "ext.kindLanguages",
  grammars: "ext.kindGrammars",
} as const

/** Human names for what an extension adds, joined into a phrase. */
export function kindsLabel(kinds: ContributionKind[], t: TFunction): string {
  const list = kinds.map((k) => t(KIND_KEYS[k]))
  if (list.length <= 1) return list[0] ?? ""
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`
}
