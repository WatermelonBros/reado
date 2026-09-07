/**
 * One list, three sources.
 *
 * A reader looking for "something that colours my Nix files" does not care that
 * a grammar comes from an open registry, a language server is spawned from a
 * compiled allowlist, and a formatter is a program in their project. Those are
 * facts about how Reado stays safe, not about what they are shopping for. So
 * the panel shows one list — installed, and suggested — and the differences
 * survive only where they change what you can actually do with a row.
 */
import type { ExtListing, ExtManifest, FormatterStatus, InstalledExt } from "@/lib/api"
import type { FormatterExt, LangServerExt, VaultExt } from "@/lib/extensions"
import { type ContributionKind, classify } from "@/lib/marketplace"

/** What a row is about, for the filter to reason over. */
export type Facet = "themes" | "languages" | "formatters" | "snippets" | "credentials"

/** A row, whatever it came from. */
export type Entry =
  | { kind: "marketplace"; id: string; listing: ExtListing; facets: Facet[] }
  | { kind: "installed"; id: string; ext: InstalledExt; facets: Facet[] }
  | { kind: "server"; id: string; def: LangServerExt; installed: boolean; facets: Facet[] }
  | { kind: "vault"; id: string; def: VaultExt; installed: boolean; facets: Facet[] }
  | {
      kind: "formatter"
      id: string
      def: FormatterExt
      status?: FormatterStatus
      facets: Facet[]
    }

/** The facets a manifest's contributions fall under. */
export function facetsOfManifest(manifest: ExtManifest | null): Facet[] {
  const map: Record<ContributionKind, Facet> = {
    themes: "themes",
    iconThemes: "themes",
    snippets: "snippets",
    languages: "languages",
    grammars: "languages",
  }
  return [...new Set(classify(manifest).kinds.map((k) => map[k]))]
}

/** Whether an entry belongs under the active filter. */
export const matchesFacet = (entry: Entry, facet: Facet | "all") =>
  facet === "all" || entry.facets.includes(facet)

/** Whether an entry matches a typed query, for the curated rows the registry
 *  search can't answer for. */
export function matchesQuery(entry: Entry, needle: string): boolean {
  if (!needle) return true
  const haystack =
    entry.kind === "marketplace"
      ? `${entry.listing.displayName} ${entry.listing.description} ${entry.listing.namespace}`
      : entry.kind === "installed"
        ? `${entry.ext.displayName} ${entry.ext.manifest.description ?? ""} ${entry.ext.namespace}`
        : `${entry.def.name} ${entry.def.description}`
  return haystack.toLowerCase().includes(needle)
}

export const serverEntry = (def: LangServerExt, installed: boolean): Entry => ({
  kind: "server",
  id: `server:${def.id}`,
  def,
  installed,
  facets: ["languages"],
})

export const formatterEntry = (def: FormatterExt, status?: FormatterStatus): Entry => ({
  kind: "formatter",
  id: `formatter:${def.id}`,
  def,
  status,
  facets: ["formatters"],
})

export const vaultEntry = (def: VaultExt, installed: boolean): Entry => ({
  kind: "vault",
  id: `vault:${def.id}`,
  def,
  installed,
  facets: ["credentials"],
})

export const installedEntry = (ext: InstalledExt): Entry => ({
  kind: "installed",
  id: ext.id,
  ext,
  facets: facetsOfManifest(ext.manifest),
})

export const listingEntry = (listing: ExtListing): Entry => ({
  kind: "marketplace",
  id: listing.id,
  listing,
  facets: facetsOfManifest(listing.manifest),
})
