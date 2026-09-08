/**
 * Per-project settings (`.reado/config.json`).
 *
 * A project can pin the preferences that belong to the *codebase* rather than to
 * the reader — how it is indented, what gets formatted on save, what the tree
 * hides — so a team shares them through git instead of each person rediscovering
 * them. On project open the config is merged over the user's global settings.
 *
 * Only keys the project *already declares* are written back. Reado used to dump
 * the whole overridable subset on every settings change, so switching your own
 * font left a modified `config.json` in every repo you had open. Creating the
 * file is now an explicit act (`saveSettingsToProject`), and after that the file
 * tracks exactly the keys it lists.
 */

import { t } from "@/i18n"
import { readProjectConfig, writeProjectConfig } from "./api"
import { log, safeError } from "./logger"
import { notify, notifyError } from "./notice"
import { sanitizeSettings } from "./settingsJson"
import { useSettings } from "./store"

/**
 * Settings a project may override.
 *
 * The test is "does this belong to the code or to the reader": indentation and
 * on-save hygiene are properties of the repository and belong in git; theme,
 * font size and zoom are properties of the person and never appear here.
 */
export const PROJECT_KEYS = [
  "wrap",
  "focusMode",
  "codeFont",
  "versionReado",
  "formatOnSave",
  "trimTrailingWhitespace",
  "insertFinalNewline",
  "defaultEol",
  "excludeGlobs",
  "searchExcludeGlobs",
  "rulerColumn",
  "renderWhitespace",
  "indentGuides",
  "largeFileGuardMb",
  "suggestOnTyping",
  "autoSave",
  "autoSaveDelay",
  // The tree's own shape: which generated files a repository considers noise is
  // a property of the repository, not of whoever opens it.
  "fileNesting",
  "fileNestingRules",
] as const
export type ProjectKey = (typeof PROJECT_KEYS)[number]

/** The keys the open project's config declares — the ones written back on
 *  change. Empty when the project has no config (or none has been opened). */
let declared: ProjectKey[] = []

/** Parse a project config into the subset Reado understands. Unknown keys are
 *  ignored rather than rejected, so a newer Reado's file still loads here. */
export function parseProjectConfig(json: string): Partial<Record<ProjectKey, unknown>> | null {
  try {
    const cfg = JSON.parse(json) as Record<string, unknown>
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return null
    const out: Partial<Record<ProjectKey, unknown>> = {}
    for (const k of PROJECT_KEYS) if (cfg[k] !== undefined) out[k] = cfg[k]
    return out
  } catch (e) {
    log.warn("projectConfig: malformed config, ignoring", { error: safeError(e) })
    return null
  }
}

/** Apply a project's saved overrides over the current (global) settings. */
export async function loadProjectConfig(root: string): Promise<void> {
  declared = []
  bumpOverrides()
  const json = await readProjectConfig(root).catch(() => null)
  if (!json) return
  const cfg = parseProjectConfig(json)
  if (!cfg) return
  // A project's config is a file in someone else's repository: its *names* were
  // filtered above, but its values are still untrusted, and a wrong-typed one
  // reaching the store is the same corruption as from any other door.
  const { patch, rejected } = sanitizeSettings(cfg as Record<string, unknown>)
  if (rejected.length > 0) log.warn("project config had unusable values", { rejected })
  declared = Object.keys(patch) as ProjectKey[]
  useSettings.getState().set(patch)
  bumpOverrides()
}

/** Persist the keys this project declares on change. Returns an unsubscribe. */
export function watchProjectConfig(root: string): () => void {
  let timer: number | undefined
  const unsub = useSettings.subscribe((s) => {
    if (declared.length === 0) return
    const subset: Record<string, unknown> = {}
    for (const k of declared) subset[k] = s[k]
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      writeProjectConfig(root, `${JSON.stringify(subset, null, 2)}\n`).catch(() => {})
    }, 600)
  })
  return () => {
    unsub()
    clearTimeout(timer)
  }
}

/**
 * Write the whole overridable subset to `.reado/config.json` — "share these
 * settings with everyone who opens this project".
 *
 * This is what creates the file in the first place; from then on the watcher
 * keeps its keys in step.
 */
export async function saveSettingsToProject(root: string): Promise<void> {
  const s = useSettings.getState()
  const subset: Record<string, unknown> = {}
  for (const k of PROJECT_KEYS) subset[k] = s[k]
  try {
    await writeProjectConfig(root, `${JSON.stringify(subset, null, 2)}\n`)
    declared = [...PROJECT_KEYS]
    bumpOverrides()
    notify("info", t("sync.projectSaved", { count: PROJECT_KEYS.length }))
  } catch (e) {
    notifyError("projectConfig", t("sync.projectFailed"), e)
  }
}

/** Whether the open project declares any settings of its own. */
export const projectDeclares = (): ProjectKey[] => declared

/** Is this setting one the open project pins for everyone who opens it? */
export const isProjectOverride = (key: string): boolean => declared.includes(key as ProjectKey)

/**
 * Stop the project pinning one setting, and rewrite the file without it.
 *
 * Without this the only way out of a project override is to edit
 * `.reado/config.json` by hand — and the settings dialog would keep showing a
 * value the reader can change but not keep.
 */
export async function dropProjectOverride(root: string, key: ProjectKey): Promise<void> {
  declared = declared.filter((k) => k !== key)
  const s = useSettings.getState()
  const subset: Record<string, unknown> = {}
  for (const k of declared) subset[k] = s[k]
  await writeProjectConfig(root, `${JSON.stringify(subset, null, 2)}\n`).catch(() => {})
  bumpOverrides()
}

/**
 * A counter bumped whenever the declared set changes.
 *
 * The declared list is module state, not a store, because it is read on the
 * completion/save paths where a subscription would be overhead. The settings
 * dialog does need to re-render on a change, so it subscribes to this instead.
 */
const listeners = new Set<() => void>()
let overrideVersion = 0
function bumpOverrides() {
  overrideVersion++
  for (const fn of listeners) fn()
}
export function subscribeOverrides(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export const overridesVersion = () => overrideVersion
