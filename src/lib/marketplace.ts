/**
 * The extension marketplace: what Reado will install from Open VSX, and what it
 * won't.
 *
 * Reado runs no extension code, so an extension is only useful here for the data
 * it declares. Open VSX publishes each extension's `package.json` separately from
 * its package, which means classification costs one small request and no
 * download: read the manifest, see whether anything in `contributes` is a kind
 * Reado supports, and see whether the extension also carries code.
 *
 * Two outcomes, and the line between them is the product's promise: **if it is
 * installable, it works.** An extension is offered only when Reado can deliver
 * everything it contributes. An extension that also ships code is not offered,
 * however useful the data inside it might be — taking half of something and
 * explaining the missing half in a footnote is not support, it is an apology
 * printed next to a broken thing.
 *
 * The judgement is made from the manifest and nothing else, so an extension
 * published tomorrow is classified exactly like one published three years ago
 * and there is no per-extension knowledge to keep up to date. What *is* curated
 * is `SUPPORTED_CONTRIBUTIONS` below — five keys, which grow when Reado gains a
 * capability, not when the registry gains an entry.
 */
import { create } from "zustand"
import type { ExtListing, ExtManifest, InstalledExt } from "./api"
import { ovsxInstall, ovsxInstalled, ovsxLatest, ovsxUninstall } from "./api"
import { useExtensions } from "./extensions"
import { preloadLanguageConfigs } from "./extLanguages"
import { createLogger } from "./logger"
import { notify } from "./notice"

const log = createLogger("marketplace")

/**
 * Contribution keys Reado reads. This list is the reach of the whole extension
 * system: an extension cannot widen it by declaring something new, and adding to
 * it is a deliberate change with a consumer behind it.
 */
export const SUPPORTED_CONTRIBUTIONS = [
  "themes",
  "iconThemes",
  "snippets",
  "languages",
  "grammars",
] as const
export type ContributionKind = (typeof SUPPORTED_CONTRIBUTIONS)[number]

export type Tier = "full" | "unsupported"

export interface Classification {
  tier: Tier
  /** The supported kinds this extension actually contributes. */
  kinds: ContributionKind[]
  /** Why it isn't offered. Kept for the log, not for a badge in the list. */
  reason?: "code" | "dependencies" | "nothingUsable" | "noManifest"
}

/** Whether a manifest's `contributes[kind]` holds anything. */
const contributes = (m: ExtManifest, kind: ContributionKind): boolean => {
  const value = m.contributes?.[kind]
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

/** What Reado can do with this extension, from its manifest alone. */
export function classify(manifest: ExtManifest | null): Classification {
  // An extension whose manifest could not be fetched cannot be classified, and
  // an unclassifiable extension is not offered.
  if (!manifest) return { tier: "unsupported", kinds: [], reason: "noManifest" }

  const kinds = SUPPORTED_CONTRIBUTIONS.filter((k) => contributes(manifest, k))
  if (kinds.length === 0) return { tier: "unsupported", kinds, reason: "nothingUsable" }

  // A code entry point means the extension does something Reado cannot do. Its
  // grammar or its snippets might work perfectly; the extension would not.
  if (manifest.main || manifest.browser) return { tier: "unsupported", kinds, reason: "code" }
  // An extension pack is a list of *other* extensions to install; Reado installs
  // one thing at a time, so the pack's contents simply would not be there.
  const bundles = [manifest.extensionPack, manifest.extensionDependencies]
  if (bundles.some((b) => b && b.length > 0))
    return { tier: "unsupported", kinds, reason: "dependencies" }

  return { tier: "full", kinds }
}

/** Installable — the filter that decides what the marketplace is allowed to
 *  show. There is exactly one bar, and everything shown clears it. */
export const isInstallable = (manifest: ExtManifest | null) => classify(manifest).tier === "full"

/**
 * Contributions that only take hold when the editor is built.
 *
 * A theme and a file-icon set are re-read live. A grammar, a snippet set and a
 * language configuration are compiled into an editor when a file opens, and a
 * language server is a process that stays connected — so changing one of those
 * leaves the windows you already have showing the old answer. That is what the
 * reload prompt is for, and why it appears for these and not for the rest.
 */
const NEEDS_RELOAD: ContributionKind[] = ["snippets", "languages", "grammars"]

/** Whether changing this extension needs the window rebuilt to be seen. */
/**
 * Drop everything cached on behalf of one extension.
 *
 * Compiled grammars and resolved themes are keyed on ids that outlive a version
 * bump, so this belongs where the installed set changes rather than in exported
 * helpers each call site has to remember.
 */
function forgetContributions(id: string): void {
  void import("./extThemes").then((m) => m.forgetExtTheme(id))
  void import("./extGrammars").then((m) => m.forgetGrammars(id))
}

export const changeNeedsReload = (manifest: ExtManifest | null) =>
  classify(manifest).kinds.some((k) => NEEDS_RELOAD.includes(k))

/**
 * The installed extensions that are switched on.
 *
 * Every consumer of a contribution reads this, never `installed` directly: a
 * disabled extension has to contribute *nothing*, and the one way to guarantee
 * that is for there to be a single place where "installed" becomes "in use".
 */
export const enabledExtensions = (installed: InstalledExt[]): InstalledExt[] => {
  const isEnabled = useExtensions.getState().isEnabled
  return installed.filter((e) => isEnabled(e.id))
}

interface MarketplaceState {
  /** Installed extensions, read from disk — there is no index to drift. */
  installed: InstalledExt[]
  /** Whether the first read from disk has happened. Until it has, "that theme's
   *  extension is missing" is a race, not a fact. */
  loaded: boolean
  /** Extension ids with an install or uninstall in flight. */
  busy: string[]
  /** Something changed that the open windows can't pick up on their own. */
  reloadNeeded: boolean
  /** Note that a change won't be visible until the window is rebuilt. */
  noteReloadNeeded: () => void
  /** Refresh the installed set from disk. Read it through
   *  {@link enabledExtensions} wherever a contribution is being consumed. */
  refresh: () => Promise<void>
  /** Install — or update: the same download, unpack and replace either way.
   *  Takes only what naming a package needs, so an installed extension plus a
   *  newer version number is a valid argument without inventing a listing. */
  install: (pkg: Package) => Promise<InstalledExt | null>
  uninstall: (namespace: string, name: string) => Promise<void>
  byId: (id: string) => InstalledExt | undefined
  /** Latest published version per id, for the ids the registry answered for.
   *  Empty until {@link checkUpdates} has run. */
  latest: Record<string, string>
  /** Ask the registry what the installed set looks like now. Once per session
   *  is enough — nothing publishes a new version while the panel is open. */
  checkUpdates: () => Promise<void>
  /** The newer version on offer for `id`, or undefined when it is current, the
   *  registry didn't answer, or the check hasn't run. */
  updateFor: (id: string) => string | undefined
}

/** Enough to name a package in the registry. Both a catalogue listing and an
 *  installed extension satisfy it. */
export type Package = Pick<ExtListing, "id" | "namespace" | "name" | "version">

export const useMarketplace = create<MarketplaceState>()((set, get) => ({
  installed: [],
  loaded: false,
  busy: [],
  reloadNeeded: false,
  noteReloadNeeded: () => set({ reloadNeeded: true }),
  byId: (id) => get().installed.find((e) => e.id === id),

  refresh: async () => {
    try {
      const installed = await ovsxInstalled()
      set({ installed })
      // Small local files, and having them in hand is what lets the editor read
      // a contributed language's comment tokens without reconfiguring itself.
      await preloadLanguageConfigs(installed)
    } catch (e) {
      log.error("could not read installed extensions", { error: String(e) })
    } finally {
      set({ loaded: true })
    }
  },

  latest: {},

  updateFor: (id) => {
    const to = get().latest[id]
    const have = get().byId(id)?.version
    return to && have && to !== have ? to : undefined
  },

  checkUpdates: async () => {
    const ids = get().installed.map((e) => e.id)
    if (ids.length === 0) return
    try {
      set({ latest: await ovsxLatest(ids) })
    } catch (e) {
      // An offline session shows no updates, which is the honest answer.
      log.warn("could not check for extension updates", { error: String(e) })
    }
  },

  install: async (pkg) => {
    const { id, namespace, name, version } = pkg
    set((s) => ({ busy: [...s.busy, id] }))
    try {
      const ext = await ovsxInstall(namespace, name, version)
      log.info("extension installed", { id, version })
      // Themes and grammars are cached by an id that survives a version bump,
      // so an update would otherwise keep showing the old colours with no
      // prompt — themes are deliberately not in NEEDS_RELOAD.
      forgetContributions(id)
      if (changeNeedsReload(ext.manifest)) set({ reloadNeeded: true })
      // Replace in place on update; append on first install. In place literally:
      // filtering and appending sent the row you just updated to the bottom of
      // the list, so the one thing you were looking at was the one thing that
      // moved.
      set((s) => ({
        installed: s.installed.some((e) => e.id === id)
          ? s.installed.map((e) => (e.id === id ? ext : e))
          : [...s.installed, ext],
      }))
      return ext
    } catch (e) {
      log.error("extension install failed", { id, error: String(e) })
      throw e
    } finally {
      set((s) => ({ busy: s.busy.filter((b) => b !== id) }))
    }
  },

  uninstall: async (namespace, name) => {
    const id = `${namespace}.${name}`
    set((s) => ({ busy: [...s.busy, id] }))
    try {
      const gone = get().installed.find((e) => e.id === id)
      await ovsxUninstall(namespace, name)
      log.info("extension uninstalled", { id })
      forgetContributions(id)
      if (gone && changeNeedsReload(gone.manifest)) set({ reloadNeeded: true })
      set((s) => ({ installed: s.installed.filter((e) => e.id !== id) }))
    } catch (e) {
      // Both call sites `void` this, so without a catch a failed removal was an
      // unhandled rejection: the row didn't change and nothing said why.
      log.error("extension uninstall failed", { id, error: String(e) })
      notify("error", `${id}: ${String(e)}`)
    } finally {
      set((s) => ({ busy: s.busy.filter((b) => b !== id) }))
    }
  },
}))
