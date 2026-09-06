/**
 * Language configuration contributed by installed extensions.
 *
 * A language contribution is two things: the file extensions that identify a
 * language, and a configuration file describing how its syntax behaves —
 * comment tokens and the pairs an editor should close for you. Reado feeds both
 * into CodeMirror's language-data facet, which is how `toggleComment` and
 * `closeBrackets` find them, so a contributed language gets those behaviours
 * without needing a parser.
 *
 * A built-in language pack always wins. Its own language data is attached to a
 * real syntax tree, and replacing that with a JSON description would be a
 * downgrade dressed as support.
 */
import { EditorState, type Extension } from "@codemirror/state"
import { extRead, type InstalledExt } from "./api"
import { parseJsonc } from "./extThemes"
import { createLogger } from "./logger"
import { langIdFor } from "./lsp"

const log = createLogger("extLanguages")

interface LanguageContribution {
  id?: string
  extensions?: string[]
  aliases?: string[]
  configuration?: string
}

interface LanguageConfigFile {
  comments?: { lineComment?: string; blockComment?: [string, string] }
  brackets?: Array<[string, string]>
  autoClosingPairs?: Array<[string, string] | { open?: string; close?: string }>
}

/** The language contributions of an installed extension. */
const contributionsOf = (ext: InstalledExt): LanguageContribution[] =>
  (ext.manifest.contributes?.languages as LanguageContribution[] | undefined) ?? []

/** Extension (without the dot) → contributed language id, across every
 *  installed extension. Lets a contributed language be recognised by file name
 *  the same way the built-in ones are. */
export function contributedLanguageIds(installed: InstalledExt[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const ext of installed) {
    for (const lang of contributionsOf(ext)) {
      if (!lang.id) continue
      for (const e of lang.extensions ?? []) map[e.replace(/^\./, "").toLowerCase()] = lang.id
    }
  }
  return map
}

/** The extension and contribution declaring `languageId`, if any. */
function findLanguage(
  installed: InstalledExt[],
  languageId: string,
): { ext: InstalledExt; lang: LanguageContribution } | null {
  for (const ext of installed) {
    const lang = contributionsOf(ext).find((l) => l.id === languageId && l.configuration)
    if (lang) return { ext, lang }
  }
  return null
}

/** Parsed configuration files, by extension and path. */
const cache = new Map<string, LanguageConfigFile>()

/** Load the configuration for a contributed language. */
export async function languageConfig(
  installed: InstalledExt[],
  languageId: string,
): Promise<LanguageConfigFile | null> {
  const found = findLanguage(installed, languageId)
  if (!found) return null
  const key = `${found.ext.id}:${found.lang.configuration}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const file = parseJsonc(
      await extRead(found.ext.namespace, found.ext.name, found.lang.configuration as string),
    ) as LanguageConfigFile
    cache.set(key, file)
    return file
  } catch (e) {
    log.warn("could not read a language configuration", { languageId, error: String(e) })
    return null
  }
}

/** Translate a configuration file into the language data CodeMirror reads. */
export function toLanguageData(config: LanguageConfigFile): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const { lineComment, blockComment } = config.comments ?? {}
  if (lineComment || blockComment) {
    data.commentTokens = {
      ...(lineComment ? { line: lineComment } : {}),
      ...(blockComment ? { block: { open: blockComment[0], close: blockComment[1] } } : {}),
    }
  }
  // `closeBrackets` wants the opening characters; the format gives pairs, in
  // two shapes (a tuple, or an object once a pair has notInside rules).
  const opens = (config.autoClosingPairs ?? [])
    .map((p) => (Array.isArray(p) ? p[0] : p.open))
    .filter((c): c is string => typeof c === "string" && c.length > 0)
  if (opens.length) data.closeBrackets = { brackets: opens }
  return data
}

/**
 * Read every contributed language configuration into memory.
 *
 * There are a handful of them and they are small files on local disk, so
 * loading them up front is cheaper than the machinery it would take to
 * reconfigure an editor that has already opened. Called when the installed set
 * changes; `contributedLanguageData` is synchronous because of it.
 */
export async function preloadLanguageConfigs(installed: InstalledExt[]): Promise<void> {
  const ids = new Set<string>()
  for (const ext of installed) {
    for (const lang of contributionsOf(ext)) if (lang.id && lang.configuration) ids.add(lang.id)
  }
  await Promise.all([...ids].map((id) => languageConfig(installed, id)))
}

/**
 * Language data for a file, from a contributed language configuration.
 *
 * Returns nothing when no extension describes the language — which is what makes
 * this safe to add unconditionally: a file whose language Reado already handles,
 * or that nothing describes, is left exactly as it was.
 */
export function contributedLanguageData(installed: InstalledExt[], languageId: string): Extension {
  const found = findLanguage(installed, languageId)
  if (!found) return []
  const config = cache.get(`${found.ext.id}:${found.lang.configuration}`)
  if (!config) return []
  const data = toLanguageData(config)
  return Object.keys(data).length ? EditorState.languageData.of(() => [data]) : []
}

/**
 * The language id for a file, taking contributed languages into account.
 *
 * Reado's own extension→id table answers for the languages it knows; a
 * contributed language that claims an extension Reado has never heard of
 * answers for that one. Snippets, language configuration and grammars all key
 * on this, so they agree about what a file is.
 */
export function resolvedLanguageId(installed: InstalledExt[], path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  return contributedLanguageIds(installed)[ext] ?? langIdFor(path)
}
