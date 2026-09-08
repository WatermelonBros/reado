/**
 * Extensions.
 *
 * One list, arranged the way you actually use it: what you have, what's worth
 * having, and a search when you know what you're after. Where a row came from —
 * the Open VSX registry, or Reado's own allowlist of things that spawn a
 * process — changes what you can do with it, not which pile it sits in.
 *
 * Reado runs no extension code. It reads what an extension declares — colours,
 * icons, snippets, grammars — and ignores the rest, which is why the list only
 * ever offers things that will actually work here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { CloseIcon, FetchIcon, SearchIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import { type ExtListing, ovsxSearch } from "@/lib/api"
import { FORMATTERS, LANG_SERVERS, VAULTS } from "@/lib/extensions"
import { isInstallable, type Package, useMarketplace } from "@/lib/marketplace"
import { notify } from "@/lib/notice"
import { useWorkspace } from "@/lib/store"
import { EntryRow } from "./extensions/EntryRow"
import {
  type Entry,
  type Facet,
  formatterEntry,
  installedEntry,
  listingEntry,
  matchesFacet,
  matchesQuery,
  serverEntry,
  vaultEntry,
} from "./extensions/entries"
import { FormatterOverride } from "./extensions/FormatterOverride"
import { ReloadNotice } from "./extensions/ReloadNotice"
import { Section } from "./extensions/Section"
import {
  useFormatterStatus,
  useLinuxPm,
  useServerStatus,
  useVaultStatus,
} from "./extensions/useCurated"

/** One page of registry results. Small: this is a sidebar, not a store front. */
const PAGE = 20
/** Wait for the typing to settle before asking the registry. */
const DEBOUNCE_MS = 300

type Filter = Facet | "all"

/**
 * The registry categories each filter draws from.
 *
 * "Everything" fans out across all of them and interleaves by installs:
 * ordering the whole registry by downloads puts the big code extensions on top,
 * and they'd all be filtered out again, leaving a page of three rows.
 */
const CATEGORIES: Record<Filter, string[]> = {
  all: ["Themes", "Snippets", "Programming Languages"],
  themes: ["Themes"],
  languages: ["Programming Languages"],
  snippets: ["Snippets"],
  // Formatters are Reado's own; the registry has none it can run.
  formatters: [],
  // Neither are password-manager CLIs — they are the vendors' own tools.
  credentials: [],
}

/** Drop repeats: an extension can sit in several registry categories, so fanning
 *  out across them brings some of them back more than once. */
const dedupe = (items: ExtListing[]) => [...new Map(items.map((i) => [i.id, i])).values()]

export function ExtensionsPanel() {
  const { t } = useTranslation()
  const installed = useMarketplace((s) => s.installed)
  const busy = useMarketplace((s) => s.busy)
  const refresh = useMarketplace((s) => s.refresh)
  // Subscribed, not read through getState: the row has to redraw when the
  // update check lands.
  const latest = useMarketplace((s) => s.latest)
  const updateFor = useCallback(
    (id: string) => {
      const to = latest[id]
      return to && to !== installed.find((e) => e.id === id)?.version ? to : undefined
    },
    [latest, installed],
  )

  const [query, setQuery] = useState("")
  const recommended = useWorkspace((s) => s.recommended)
  const setRecommended = useWorkspace((s) => s.setRecommended)
  const [filter, setFilter] = useState<Filter>("all")
  const [results, setResults] = useState<ExtListing[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  // Every answer carries the request that produced it, so a slow page of stale
  // results can never overwrite a fast newer one.
  const request = useRef(0)

  const linuxPm = useLinuxPm()
  const servers = useServerStatus()
  const { status: formatters, recheck: recheckFormatters } = useFormatterStatus()
  const vaults = useVaultStatus()

  useEffect(() => {
    // Then ask the registry what has moved on since. Installed extensions are
    // read from disk, so without this nothing on the machine ever learns that a
    // newer version exists.
    void refresh().then(() => useMarketplace.getState().checkUpdates())
  }, [refresh])

  const needle = query.trim().toLowerCase()
  const searchMode = needle.length > 0

  /** Everything installed, of every kind. */
  const mine = useMemo(() => {
    const rows: Entry[] = [
      ...installed.map(installedEntry),
      ...FORMATTERS.filter((f) => formatters[f.id]?.installed).map((f) =>
        formatterEntry(f, formatters[f.id]),
      ),
      ...LANG_SERVERS.filter((s) => servers.installed[s.id]).map((s) => serverEntry(s, true)),
      ...VAULTS.filter((v) => vaults.installed[v.id]).map((v) => vaultEntry(v, true)),
    ]
    return rows.filter((e) => matchesFacet(e, filter) && matchesQuery(e, needle))
  }, [installed, formatters, servers.installed, vaults.installed, filter, needle])

  /** Everything Reado can offer that isn't installed yet. */
  const available = useMemo(() => {
    const have = new Set(installed.map((e) => e.id))
    const rows: Entry[] = [
      ...FORMATTERS.filter((f) => !formatters[f.id]?.installed).map((f) =>
        formatterEntry(f, formatters[f.id]),
      ),
      ...LANG_SERVERS.filter((s) => !servers.installed[s.id]).map((s) => serverEntry(s, false)),
      // Suggested even unasked-for: someone running the Bitwarden or 1Password
      // *app* has no way to guess that the browser pane needs the CLI instead.
      ...VAULTS.filter((v) => !vaults.installed[v.id]).map((v) => vaultEntry(v, false)),
    ]
    const fromRegistry = results.filter((l) => !have.has(l.id)).map(listingEntry)
    const shown = [...rows, ...fromRegistry].filter(
      (e) => matchesFacet(e, filter) && matchesQuery(e, needle),
    )
    // Browsing "Everything" used to lead with ~41 uninstalled formatters and
    // language servers in source order — biome, prettier, rustfmt, shfmt… — so
    // the first thing anyone opening this panel saw was a wall of tools for
    // languages their project doesn't use, and the first ten buttons on screen
    // were the ones that take over your terminal. The ones this project
    // actually declares stay; the rest wait behind their own filter.
    if (searchMode || filter !== "all") return shown
    // A formatter this project declares is a real suggestion. A language server
    // for a language that isn't open is not — it waits behind its own filter,
    // one click away in the Show menu, where it was actually asked for.
    return shown.filter((e) => (e.kind === "formatter" ? e.status?.declared : e.kind !== "server"))
  }, [
    installed,
    formatters,
    servers.installed,
    vaults.installed,
    results,
    filter,
    needle,
    searchMode,
  ])

  const search = useCallback(async (q: string, f: Filter, offset: number) => {
    const categories = CATEGORIES[f]
    if (categories.length === 0) return
    const id = ++request.current
    setSearching(true)
    setFailed(false)
    try {
      const pages = await Promise.all(
        categories.map((c) => ovsxSearch(q, c, offset, PAGE, q ? null : "downloads")),
      )
      if (id !== request.current) return
      // Extensions Reado can't install are dropped here rather than shown greyed
      // out: a list of things you can't have is not a catalogue.
      const usable = dedupe(
        pages.flatMap((p) => p.items).filter((i) => isInstallable(i.manifest)),
      ).sort((a, b) => b.downloadCount - a.downloadCount)
      setResults((prev) => (offset === 0 ? usable : [...prev, ...usable]))
      setTotal(pages.reduce((n, p) => n + p.total, 0))
    } catch {
      if (id !== request.current) return
      setFailed(true)
      setResults([])
    } finally {
      if (id === request.current) setSearching(false)
    }
  }, [])

  // One path for both: an empty query asks the registry for the most-installed,
  // which is what you browse when you don't know a name yet. Debounced only
  // while typing — a filter change should answer at once.
  useEffect(() => {
    const timer = window.setTimeout(
      () => void search(query, filter, 0),
      searchMode ? DEBOUNCE_MS : 0,
    )
    return () => window.clearTimeout(timer)
  }, [query, filter, searchMode, search])

  const install = async (pkg: Package & { displayName: string }) => {
    try {
      await useMarketplace.getState().install(pkg)
    } catch (e) {
      notify("error", t("ext.installFailed", { name: pkg.displayName, error: String(e) }))
    }
  }

  const row = (entry: Entry) => (
    <EntryRow
      key={entry.id}
      entry={entry}
      linuxPm={linuxPm}
      busy={
        busy.includes(entry.id)
          ? entry.kind === "installed"
            ? "uninstalling"
            : "installing"
          : null
      }
      onInstall={entry.kind === "marketplace" ? () => install(entry.listing) : undefined}
      onUninstall={
        entry.kind === "installed"
          ? () => void useMarketplace.getState().uninstall(entry.ext.namespace, entry.ext.name)
          : undefined
      }
      updateTo={entry.kind === "installed" ? updateFor(entry.ext.id) : undefined}
      onUpdate={
        entry.kind === "installed"
          ? () => void install({ ...entry.ext, version: updateFor(entry.ext.id) ?? "" })
          : undefined
      }
      // Every row opens, whichever catalogue it came from.
      onOpen={() =>
        useWorkspace.getState().readExtension(
          entry.kind === "installed"
            ? {
                kind: "registry",
                namespace: entry.ext.namespace,
                name: entry.ext.name,
                version: entry.ext.version,
              }
            : entry.kind === "marketplace"
              ? {
                  kind: "registry",
                  namespace: entry.listing.namespace,
                  name: entry.listing.name,
                  version: entry.listing.version,
                  listing: entry.listing,
                }
              : { kind: "curated", id: entry.def.id },
        )
      }
    />
  )

  const canLoadMore = searchMode && results.length > 0 && results.length < total && !searching

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-none border-b border-line px-3 pt-2 pb-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("ext.searchPlaceholder")}
          aria-label={t("ext.searchPlaceholder")}
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          trailing={
            query ? (
              <IconButton
                size="sm"
                label={t("common.clear")}
                icon={<CloseIcon className="h-3.5 w-3.5" />}
                onClick={() => setQuery("")}
              />
            ) : undefined
          }
        />

        <div className="mt-2">
          <Select
            ariaLabel={t("ext.filterLabel")}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            variant="ghost"
            className="w-full justify-between border border-line"
            options={[
              { value: "all", label: t("ext.filterAll") },
              { value: "themes", label: t("ext.filterThemes") },
              { value: "languages", label: t("ext.filterLanguages") },
              { value: "formatters", label: t("ext.filterFormatters") },
              { value: "snippets", label: t("ext.filterSnippets") },
              { value: "credentials", label: t("ext.filterCredentials") },
            ]}
          />
        </div>
      </div>

      <ReloadNotice />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* What the repository itself says a reader of this codebase needs.
            Advisory, dismissable, and above the rest because it is the one list
            here that knows something about *this* project. */}
        {recommended.length > 0 && (
          <Section
            id="recommended"
            title={t("ext.recommendedTitle")}
            count={recommended.length}
            forceOpen={searchMode}
            action={
              <IconButton
                size="sm"
                label={t("ext.recommendedDismiss")}
                icon={<CloseIcon className="h-3.5 w-3.5" />}
                onClick={() => setRecommended([])}
              />
            }
          >
            <ul className="m-0 list-none p-0">
              {recommended.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setQuery(id)}
                    className="w-full px-3 py-1.5 text-left font-mono text-xs text-ink hover:bg-surface"
                  >
                    {id}
                  </button>
                </li>
              ))}
            </ul>
            <p className="px-3 pt-1 pb-2 text-[10px] leading-relaxed text-faint">
              {t("ext.recommendedHint")}
            </p>
          </Section>
        )}

        <Section
          id="installed"
          title={t("ext.installedSection")}
          count={mine.length}
          forceOpen={searchMode}
          action={
            // Formatters and language servers are installed by the user's own
            // package manager, outside Reado — so there has to be a way to say
            // "look again" without restarting the app.
            <IconButton
              size="sm"
              label={t("ext.recheck")}
              icon={
                <FetchIcon className={`h-3.5 w-3.5 ${servers.checking ? "animate-spin" : ""}`} />
              }
              onClick={() => {
                servers.recheck()
                recheckFormatters()
              }}
              disabled={servers.checking}
            />
          }
        >
          <FormatterOverride status={formatters} filter={filter} />
          {mine.length === 0 ? (
            <p className="px-3 py-3 text-xs leading-relaxed text-faint">{t("ext.emptyHint")}</p>
          ) : (
            <ul className="m-0 list-none p-0">{mine.map(row)}</ul>
          )}
        </Section>

        <Section
          id="available"
          title={searchMode ? t("ext.marketplace") : t("ext.suggested")}
          count={available.length}
          forceOpen={searchMode}
        >
          {failed ? (
            <p className="px-3 py-4 text-xs leading-relaxed text-muted">{t("ext.searchFailed")}</p>
          ) : available.length === 0 ? (
            <p className="px-3 py-4 text-xs leading-relaxed text-faint">
              {searching ? (
                t("ext.searching")
              ) : (
                <>
                  <span className="text-muted">{t("ext.noResults")}</span> {t("ext.noResultsHint")}
                </>
              )}
            </p>
          ) : (
            <>
              <ul className="m-0 list-none p-0">{available.map(row)}</ul>
              {canLoadMore && (
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => void search(query, filter, results.length)}
                  >
                    {t("ext.loadMore")}
                  </Button>
                </div>
              )}
              {searching && <p className="px-3 pb-3 text-xs text-faint">{t("ext.searching")}</p>}
            </>
          )}
        </Section>

        {/* Said once, at the bottom, rather than repeated as a badge on every
            row: it is the reason the list looks the way it does. Kept during a
            search too — searching for an extension that isn't here is exactly
            when its absence needs explaining, and hiding the rule then left the
            confusing case as the only one with no answer. */}
        <p className="px-3 py-4 text-xs leading-relaxed text-faint">
          <span className="text-muted">{t("ext.noCode")}</span> {t("ext.noCodeHint")}
        </p>
      </div>
    </div>
  )
}
