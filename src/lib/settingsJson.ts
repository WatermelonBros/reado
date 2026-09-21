/**
 * The settings as JSON — readable, diffable, pasteable.
 *
 * Reado keeps preferences in a store, not in a file, which is fine until you
 * want to send someone your configuration, put it in an issue, or copy one
 * value between machines. This is the text view of that store, and the way back
 * in.
 *
 * Editing it is a real path into the store, so the parse is strict: a key Reado
 * doesn't have, or a value of the wrong shape, is *reported* and skipped rather
 * than written. A settings file that silently half-applies is worse than one
 * that tells you which two lines it couldn't use.
 */

import { SETTINGS_EXCLUDED, syncableKeys } from "./settingsSync"
import {
  clampRange,
  DEFAULTS,
  ENUM_VALUES,
  NUMBER_RANGES,
  type SettingsState,
  useSettings,
} from "./store"

type Key = keyof typeof DEFAULTS

/** The settings as pretty JSON, in a stable (alphabetical) key order so two
 *  dumps of the same configuration diff cleanly. */
export function settingsToJson(): string {
  const s = useSettings.getState()
  const keys = syncableKeys(s).sort() as Key[]
  return `${JSON.stringify(Object.fromEntries(keys.map((k) => [k, s[k]])), null, 2)}\n`
}

/**
 * Whether `value` has the same shape as the setting's shipped default.
 *
 * A default of `null` means the setting is optional, and in this store that is
 * always "a name, or nothing" (`iconTheme`) — the one field where `null` stands
 * for a structure, `zenRestore`, never gets here because it is excluded from the
 * document entirely.
 */
function shapeMatches(key: Key, value: unknown): boolean {
  const def = DEFAULTS[key] as unknown
  if (Array.isArray(def)) return Array.isArray(value) && value.every((v) => typeof v === "string")
  if (def === null) return value === null || typeof value === "string"
  return value !== null && typeof value === typeof def
}

/**
 * Keep only the entries Reado has and can hold, reporting the rest.
 *
 * Every path that puts foreign JSON into the settings store goes through this —
 * the text dialog, the pasted/imported bundle, and a project's `config.json`.
 * A value of the wrong type reaching the store is the same corruption whichever
 * door it came in by.
 */
export function sanitizeSettings(raw: Record<string, unknown>): ParsedSettings {
  const patch: Record<string, unknown> = {}
  const rejected: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const known = key in DEFAULTS && !SETTINGS_EXCLUDED.has(key as keyof SettingsState)
    if (!known || !shapeMatches(key as Key, value)) {
      rejected.push(key)
      continue
    }
    // Right type, wrong magnitude is still corruption: `terminalScrollback: -5`
    // is a number, and it took the whole window down. Every numeric setting is
    // clamped to the range its own control already enforces, so the JSON dialog,
    // a sync bundle and a project config cannot reach further than the UI can.
    // A word outside the shipped set is corruption too, and a quieter kind: it
    // reaches the store as a plain string and only shows up when something
    // looks it up — `colorVision: "protanopia"` took the window to the error
    // boundary on the next paint. Rejected rather than clamped: there is no
    // "nearest" value to fall back to, and telling the user which line was
    // unusable beats silently choosing for them.
    const allowed = ENUM_VALUES[key as keyof typeof ENUM_VALUES] as readonly string[] | undefined
    if (allowed && !allowed.includes(value as string)) {
      rejected.push(key)
      continue
    }
    const range = NUMBER_RANGES[key as keyof typeof NUMBER_RANGES]
    patch[key] = range ? clampRange(value as number, range) : value
  }
  return { patch: patch as Partial<SettingsState>, rejected }
}

export interface ParsedSettings {
  /** Values that will be applied. */
  patch: Partial<SettingsState>
  /** Keys Reado doesn't have, or whose value was the wrong shape. */
  rejected: string[]
}

/** Parse an edited settings document. Returns null only when it isn't JSON. */
export function parseSettingsJson(json: string): ParsedSettings | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return sanitizeSettings(raw as Record<string, unknown>)
}

/** Apply a parsed document. Returns how many settings it wrote. */
export function applySettingsJson(parsed: ParsedSettings): number {
  const count = Object.keys(parsed.patch).length
  if (count > 0) useSettings.getState().set(parsed.patch)
  return count
}
