/**
 * Where every setting lives.
 *
 * Fifty-odd controls across six tabs is past the point where a taxonomy —
 * any taxonomy — reliably takes you to the one you want. Search is what makes
 * that survivable, and search needs the settings as data, not as JSX.
 *
 * Each entry names a control by its label key and says which tab and which
 * section holds it. The pairing is checked by a test rather than by discipline:
 * a control that moves without its index entry moving is the failure mode this
 * whole file exists to avoid.
 */
import type { MessageKey } from "@/i18n"

export type SettingsTab = "appearance" | "editor" | "interface" | "files" | "system"

export interface SettingEntry {
  /** i18n key of the control's label — also its identity here. */
  key: MessageKey
  tab: SettingsTab
  /** The `Section` it sits in; the search result reads as "Tab › Section". */
  section: string
  /** i18n key of the section's own title. */
  sectionKey: MessageKey
}

const group = (
  tab: SettingsTab,
  section: string,
  sectionKey: MessageKey,
  keys: MessageKey[],
): SettingEntry[] => keys.map((key) => ({ key, tab, section, sectionKey }))

export const SETTINGS_INDEX: SettingEntry[] = [
  ...group("appearance", "theme", "settings.theme", ["settings.themeMode", "settings.theme"]),
  ...group("appearance", "language", "settings.language", ["settings.language"]),

  ...group("editor", "typography", "settings.typography", [
    "settings.codeFont",
    "settings.codeFontCustom",
    "settings.fontSize",
    "settings.lineHeight",
    "settings.letterSpacing",
    "settings.ruler",
  ]),
  ...group("editor", "gutter", "settings.gutter", [
    "settings.lineNumbers",
    "settings.activeLine",
    "settings.indentGuides",
  ]),
  ...group("editor", "autosave", "settings.autoSave", [
    "settings.autoSave",
    "settings.autoSaveDelay",
  ]),
  // Four of these borrow their label from the `editor.*` namespace rather than
  // `settings.*`. That is fine — but it is also why they were missing here, and
  // why the guard test (which only looked for `settings.*` labels) never said
  // so. Search could not reach word wrap, sticky scroll or focus mode at all.
  ...group("editor", "aids", "settings.aids", [
    "editor.wrap",
    "settings.wrapColumn",
    "editor.columnSelection",
    "editor.sticky",
    "editor.focus",
    "settings.colorSwatches",
    "settings.renderWhitespace",
    "settings.bracketMatching",
    "settings.bracketPairColors",
    "settings.suggestOnTyping",
  ]),

  ...group("interface", "accessibility", "settings.accessibility", [
    "settings.zoom",
    "settings.colorVision",
    "settings.reduceMotion",
  ]),
  ...group("interface", "cursor", "settings.cursor", [
    "settings.cursorStyle",
    "settings.cursorBlink",
  ]),
  ...group("interface", "surfaces", "settings.surfaces", [
    "settings.tabBar",
    "settings.previewTabs",
    "settings.scrollbar",
    "settings.fileIcons",
    "settings.iconTheme",
  ]),
  ...group("interface", "chrome", "settings.chrome", [
    "settings.showActivityBar",
    "settings.showStatusBar",
    "settings.showBreadcrumbs",
    "editor.ribbon",
  ]),

  ...group("files", "project", "settings.project", [
    "settings.restoreSession",
    "settings.largeFileGuard",
    "settings.exclude",
    "settings.searchExclude",
    "settings.explorerSort",
    "settings.fileNesting",
    "settings.fileNestingRules",
  ]),
  ...group("files", "onSave", "settings.onSave", [
    "settings.formatOnSave",
    "settings.formatOnPaste",
    "settings.formatOnType",
    "settings.trimTrailingWhitespace",
    "settings.insertFinalNewline",
    "settings.defaultEol",
  ]),
  ...group("files", "gitSignals", "settings.gitSignals", [
    "settings.inlineBlame",
    "settings.diffGutter",
  ]),

  ...group("system", "review", "settings.review", [
    "settings.showResolvedComments",
    "settings.inlineDiagnostics",
  ]),
  ...group("system", "notifications", "settings.notifications", [
    "settings.notifications",
    "settings.completionSound",
  ]),
  ...group("system", "terminal", "settings.terminal", [
    "settings.terminalFontSize",
    "settings.terminalScrollback",
    "settings.terminalCursor",
    "settings.terminalShell",
    "settings.terminalShellArgs",
    "settings.terminalProfiles",
    "settings.defaultTerminalProfile",
  ]),
  ...group("system", "logging", "settings.logging", ["settings.logEnabled"]),
  ...group("system", "cli", "settings.cli", ["settings.cliInstall"]),
]

/** The setting's own name, lower-cased: the tail of its i18n key, which the
 *  index is built to mirror (`settings.stickyScroll` → `stickyscroll`). */
const settingId = (key: MessageKey): string => key.slice(key.lastIndexOf(".") + 1).toLowerCase()

/** Settings whose label or hint matches `query`, ranked so a name that starts
 *  with what you typed beats one that merely contains it. */
export function findSettings(
  query: string,
  t: (key: MessageKey) => string,
  limit = 8,
): SettingEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const scored: Array<{ entry: SettingEntry; score: number }> = []
  for (const entry of SETTINGS_INDEX) {
    const label = t(entry.key).toLowerCase()
    const hint = t(`${entry.key}Hint` as MessageKey)
    // A missing hint comes back as its own key, which must not match.
    const body = hint.startsWith("settings.") ? "" : hint.toLowerCase()
    // The setting's own name, as it appears in the JSON view one button away
    // and in every changelog and doc that mentions it. Searching only the
    // translated label meant `stickyScroll` found nothing in an Italian UI —
    // and nothing in an English one either, since the label reads "Sticky
    // scroll" with a space.
    const id = settingId(entry.key)
    if (label.startsWith(needle) || id.startsWith(needle)) scored.push({ entry, score: 0 })
    else if (label.includes(needle) || id.includes(needle)) scored.push({ entry, score: 1 })
    else if (body.includes(needle)) scored.push({ entry, score: 2 })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.entry)
}
