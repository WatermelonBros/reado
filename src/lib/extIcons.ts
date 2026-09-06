/**
 * File icons contributed by an installed extension.
 *
 * An icon theme is a JSON index: named definitions pointing at SVGs (or at a
 * glyph in a bundled icon font), plus lookup tables from file name, extension
 * and language id to those names. Resolution order matches the format's own —
 * exact file name first, then extension, then language — so a theme that gives
 * `package.json` its own icon gets it, rather than the generic JSON one.
 *
 * Assets are fetched lazily, one definition at a time, as rows ask for them. The
 * alternative — preloading every definition when a theme is selected — is a
 * thousand round trips for a tree that shows forty files.
 */
import { create } from "zustand"
import { extAsset, extRead, type InstalledExt } from "./api"
import { resolvedLanguageId } from "./extLanguages"
import { parseJsonc, resolveSibling } from "./extThemes"
import { createLogger } from "./logger"
import { enabledExtensions, useMarketplace } from "./marketplace"

const log = createLogger("extIcons")

/** An icon theme an extension contributes. */
export interface ExtIconTheme {
  id: `ext:${string}`
  label: string
  namespace: string
  name: string
  path: string
}

interface IconDefinition {
  iconPath?: string
  fontCharacter?: string
  fontColor?: string
  fontId?: string
}

interface FontDefinition {
  id?: string
  src?: Array<{ path?: string; format?: string }>
  weight?: string
  style?: string
}

/** The subset of the icon-theme format Reado reads. */
interface IconThemeFile {
  iconDefinitions?: Record<string, IconDefinition>
  fonts?: FontDefinition[]
  file?: string
  folder?: string
  folderExpanded?: string
  fileExtensions?: Record<string, string>
  fileNames?: Record<string, string>
  languageIds?: Record<string, string>
  folderNames?: Record<string, string>
  folderNamesExpanded?: Record<string, string>
}

/** The icon themes an installed extension contributes. */
export function iconThemesOf(ext: InstalledExt): ExtIconTheme[] {
  const list =
    (ext.manifest.contributes?.iconThemes as Array<{
      id?: string
      label?: string
      path?: string
    }>) ?? []
  return list
    .filter((t) => typeof t.path === "string")
    .map((t, i) => ({
      id: `ext:${ext.id}:${t.id ?? i}` as const,
      label: t.label ?? t.id ?? ext.displayName,
      namespace: ext.namespace,
      name: ext.name,
      path: t.path as string,
    }))
}

/** Every icon theme from the extensions that are switched on — filtered here so
 *  a caller can't offer one belonging to an extension the user turned off. */
export const allIconThemes = (installed: InstalledExt[]): ExtIconTheme[] =>
  enabledExtensions(installed).flatMap(iconThemesOf)

/** What to draw for one entry: an image, a glyph from the theme's own font, or
 *  nothing (in which case Reado's built-in glyph is used). */
export type ResolvedIcon =
  | { kind: "image"; src: string }
  | { kind: "glyph"; char: string; color?: string; family: string }
  | null

interface IconState {
  /** The active theme, once loaded. */
  theme: ExtIconTheme | null
  file: IconThemeFile | null
  /** Data URLs by icon-definition key, filled as rows ask for them. */
  assets: Record<string, string>
  /** Keys with a read in flight, so a repeated row doesn't refetch. */
  pending: Set<string>
  load: (theme: ExtIconTheme | null) => Promise<void>
  /** Resolve an entry to something drawable, requesting its asset if needed. */
  resolve: (name: string, isDir: boolean, expanded: boolean) => ResolvedIcon
}

/** Font families registered for the active theme, so `@font-face` is injected
 *  once per font rather than once per icon. */
const registeredFonts = new Set<string>()

/** Register a theme's icon font with the document. Icon fonts are the older
 *  half of this format (Seti, the editor's own default, is one). */
async function registerFonts(theme: ExtIconTheme, file: IconThemeFile): Promise<void> {
  for (const font of file.fonts ?? []) {
    const source = font.src?.find((s) => s.path)
    const family = font.id
    if (!source?.path || !family || registeredFonts.has(family)) continue
    try {
      const url = await extAsset(
        theme.namespace,
        theme.name,
        resolveSibling(theme.path, source.path),
      )
      const face = new FontFace(family, `url(${url})`, {
        weight: font.weight ?? "normal",
        style: font.style ?? "normal",
      })
      await face.load()
      document.fonts.add(face)
      registeredFonts.add(family)
    } catch (e) {
      log.warn("could not load an icon font", { theme: theme.id, error: String(e) })
    }
  }
}

export const useIconTheme = create<IconState>()((set, get) => ({
  theme: null,
  file: null,
  assets: {},
  pending: new Set(),

  load: async (theme) => {
    if (!theme) return set({ theme: null, file: null, assets: {}, pending: new Set() })
    try {
      const file = parseJsonc(
        await extRead(theme.namespace, theme.name, theme.path),
      ) as IconThemeFile
      set({ theme, file, assets: {}, pending: new Set() })
      await registerFonts(theme, file)
    } catch (e) {
      log.warn("could not load an icon theme", { id: theme.id, error: String(e) })
      set({ theme: null, file: null })
    }
  },

  resolve: (name, isDir, expanded) => {
    const { theme, file, assets, pending } = get()
    if (!theme || !file) return null

    const key = definitionKey(file, name, isDir, expanded)
    if (!key) return null
    const def = file.iconDefinitions?.[key]
    if (!def) return null

    if (def.fontCharacter) {
      const family = def.fontId ?? file.fonts?.[0]?.id
      if (family) return { kind: "glyph", char: def.fontCharacter, color: def.fontColor, family }
    }
    if (!def.iconPath) return null

    const cached = assets[key]
    if (cached) return { kind: "image", src: cached }
    if (!pending.has(key)) {
      pending.add(key)
      void extAsset(theme.namespace, theme.name, resolveSibling(theme.path, def.iconPath))
        .then((src) => set((s) => ({ assets: { ...s.assets, [key]: src } })))
        .catch(() => {})
        .finally(() => pending.delete(key))
    }
    // Reado's own glyph stands in for the one frame it takes to read the file.
    return null
  },
}))

/** The icon-definition key for an entry, in the format's own precedence order.
 *  Exported so a row can subscribe to its own key rather than to the whole
 *  asset map — which re-rendered every row each time one icon arrived. */
export function definitionKey(
  file: IconThemeFile,
  name: string,
  isDir: boolean,
  expanded: boolean,
): string | undefined {
  const lower = name.toLowerCase()
  if (isDir) {
    const named = expanded ? file.folderNamesExpanded?.[lower] : file.folderNames?.[lower]
    return named ?? (expanded ? file.folderExpanded : file.folder) ?? file.folder
  }
  const byName = file.fileNames?.[lower]
  if (byName) return byName
  // Longest extension first, so `component.spec.ts` can differ from `x.ts`.
  const parts = lower.split(".")
  for (let i = 1; i < parts.length; i++) {
    const byExt = file.fileExtensions?.[parts.slice(i).join(".")]
    if (byExt) return byExt
  }
  // `languageIds` is keyed by language identifier — `shellscript`, `typescript`
  // — not by file suffix. Indexing it with the suffix worked only for the ids
  // that happen to equal their extension. Resolving the real id costs a map
  // rebuild, so it is done only for the themes that actually key by language
  // (most key by extension and never reach here).
  if (file.languageIds) {
    const id = resolvedLanguageId(enabledExtensions(useMarketplace.getState().installed), name)
    const byLanguage = file.languageIds[id]
    if (byLanguage) return byLanguage
  }
  return file.file
}
