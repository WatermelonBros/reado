/**
 * Settings sync via a portable bundle (clipboard / pasted text).
 *
 * Exports the user's global preferences + disabled-extension list as a versioned
 * JSON bundle and re-applies it on another machine — to the clipboard, or to a
 * file you picked, so the bundle can live in a dotfiles repo. The file path is
 * always one the OS dialog returned and must end in `.json`; the backend has no
 * general read/write-any-file command behind it.
 *
 * Never includes secrets or project-local state (recents, sessions, window
 * layout, `.reado/` — that is `lib/projectConfig.ts`, which is shared through
 * the repository instead).
 */
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { readSettingsFile, writeSettingsFile } from "./api"
import { useExtensions } from "./extensions"
import { createLogger, safeError } from "./logger"
import { notify, notifyError } from "./notice"
import { prompt } from "./prompt"
import { sanitizeSettings } from "./settingsJson"
import { type SettingsState, useSettings } from "./store"

const log = createLogger("settingsSync")

const BUNDLE_VERSION = 1

/**
 * Fields that must NOT travel between machines. Everything else in `SettingsState`
 * is machine-independent user preference and syncs automatically — so a new
 * setting is included by default rather than being silently dropped until someone
 * remembers to add it to a whitelist. Excluded: the store action, and machine-
 * local state that would be wrong to carry over (the OS default-app prompt was
 * dismissed *on this machine*). `settingsSyncCoversAllKeys` (see the test) guards
 * this invariant so a future field can't slip through unclassified.
 */
export const SETTINGS_EXCLUDED: ReadonlySet<keyof SettingsState> = new Set([
  "set",
  "reset",
  "defaultAppsDismissed",
  // Zen is a session mode, and `zenRestore` is a snapshot of *this* machine's
  // chrome. Carrying them over would land the other machine in zen with a
  // restore point it never chose.
  "zenMode",
  "zenRestore",
])

/** The settings fields that travel between machines, derived from live state. */
export function syncableKeys(s: SettingsState): (keyof SettingsState)[] {
  return (Object.keys(s) as (keyof SettingsState)[]).filter(
    (k) => !SETTINGS_EXCLUDED.has(k) && typeof s[k] !== "function",
  )
}

interface Bundle {
  version: number
  settings: Partial<SettingsState>
  extensionsDisabled: string[]
}

export function buildBundle(): Bundle {
  const s = useSettings.getState()
  const settings = Object.fromEntries(
    syncableKeys(s).map((k) => [k, s[k]]),
  ) as Partial<SettingsState>
  return {
    version: BUNDLE_VERSION,
    settings,
    extensionsDisabled: useExtensions.getState().disabled,
  }
}

/** Parse + validate a bundle. Returns null on malformed input or a newer schema
 *  than this build understands (forward-incompatible). */
export function parseBundle(json: string): Bundle | null {
  let b: Bundle
  try {
    b = JSON.parse(json) as Bundle
  } catch (e) {
    log.warn("malformed bundle JSON", { error: safeError(e) })
    return null
  }
  if (!b || typeof b !== "object" || typeof b.settings !== "object") return null
  if (typeof b.version === "number" && b.version > BUNDLE_VERSION) return null // too new
  return b
}

/** A plain summary of what importing a bundle will change (for confirmation). */
export function summarizeBundle(b: Bundle): string {
  const settings = Object.keys(b.settings ?? {}).length
  const disabled = Array.isArray(b.extensionsDisabled) ? b.extensionsDisabled.length : 0
  return t("sync.summary", { settings, disabled })
}

/** Apply a parsed bundle. */
export function applyBundle(b: Bundle): void {
  // Through the same validation the JSON dialog uses. A bundle is a file people
  // hand-edit and keep in a dotfiles repo — accepting a wrong-typed value here
  // while rejecting it by name three files over would be the same store, two
  // standards.
  const { patch, rejected } = sanitizeSettings((b.settings ?? {}) as Record<string, unknown>)
  useSettings.getState().set(patch)
  if (rejected.length > 0) log.warn("bundle had unusable settings", { rejected })
  if (Array.isArray(b.extensionsDisabled)) {
    useExtensions.setState({ disabled: b.extensionsDisabled })
  }
  log.info("settings imported", {
    settings: Object.keys(patch).length,
    disabled: b.extensionsDisabled?.length ?? 0,
  })
}

/** Copy the current settings bundle to the clipboard. */
export async function exportSettings(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildBundle(), null, 2))
    log.info("settings exported")
  } catch (e) {
    log.error("settings export failed", { error: safeError(e) })
  }
}

/** Ask where to put the bundle, then write it there. */
export async function exportSettingsToFile(): Promise<void> {
  const path = await saveDialog({
    title: t("sync.exportFile"),
    defaultPath: "reado-settings.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (!path) return
  try {
    await writeSettingsFile(path, `${JSON.stringify(buildBundle(), null, 2)}\n`)
    notify("info", t("sync.exported", { path }))
  } catch (e) {
    notifyError("settingsSync", t("sync.projectFailed"), e)
  }
}

/** Pick a bundle file, show a summary, and apply it on confirm. */
export async function importSettingsFromFile(): Promise<void> {
  const picked = await openDialog({
    title: t("sync.importFile"),
    multiple: false,
    directory: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (typeof picked !== "string") return
  const json = await readSettingsFile(picked).catch(() => null)
  const bundle = json && parseBundle(json)
  if (!bundle) {
    await ask(t("sync.invalid"), { title: t("sync.import"), kind: "error" })
    return
  }
  const ok = await ask(summarizeBundle(bundle), {
    title: t("sync.import"),
    okLabel: t("sync.apply"),
  })
  if (ok) applyBundle(bundle)
}

/** Prompt for a pasted bundle, show a summary, and apply it on confirm. */
export async function importSettings(): Promise<void> {
  const json = await prompt({
    title: t("sync.importTitle"),
    placeholder: "{ …bundle JSON… }",
    confirmLabel: t("sync.import"),
  })
  if (!json) return
  const bundle = parseBundle(json)
  if (!bundle) {
    await ask(t("sync.invalid"), { title: t("sync.import"), kind: "error" })
    return
  }
  const ok = await ask(summarizeBundle(bundle), {
    title: t("sync.import"),
    okLabel: t("sync.apply"),
  })
  if (ok) applyBundle(bundle)
}
