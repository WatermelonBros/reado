import { create } from "zustand"
import { persist } from "zustand/middleware"

export type BuiltinTheme = "reado-dark" | "reado-light" | "reado-high-contrast" | "reado-sepia"

/** A theme contributed by an installed extension: `ext:{extensionId}:{label}`.
 *  Kept as a template literal type so it stays distinguishable from a built-in
 *  at every use site instead of widening the whole setting to `string`. */
export type ExtThemeName = `ext:${string}`

export type ThemeName = BuiltinTheme | ExtThemeName

/** Whether a chosen theme comes from an extension rather than from Reado. */
export const isExtTheme = (t: ThemeName): t is ExtThemeName => t.startsWith("ext:")

export type ThemeMode = "manual" | "system" | "auto"

export const THEMES: BuiltinTheme[] = [
  "reado-dark",
  "reado-light",
  "reado-high-contrast",
  "reado-sepia",
]

/** Legible bounds for the editor's numeric reading controls. */
export const FONT_SIZE_RANGE = { min: 10, max: 24, default: 13 } as const
export const LINE_HEIGHT_RANGE = { min: 1.2, max: 2.2, default: 1.65 } as const
/** Letter spacing in ems. 0 is today's rendering, so the default changes nothing.
 *  The top of the range is deliberately generous: Zorzi et al. (PNAS 2012) found
 *  reading gains for dyslexic readers at spacings that look extreme to everyone
 *  else, and the reader is the one who knows. */
export const LETTER_SPACING_RANGE = { min: 0, max: 0.4, default: 0 } as const

/** Clamp `n` into a range; a non-finite value falls back to the range default,
 *  so a corrupted persisted value can never reach the editor. */
export const clampRange = (n: number, r: { min: number; max: number; default: number }): number =>
  Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, n)) : r.default

/**
 * Every numeric setting's allowed range, in one place.
 *
 * These limits used to live only in the *controls* (`NumberField`'s `min`/`max`
 * in Settings), which made them unenforceable from anywhere else: the settings
 * JSON dialog, an imported sync bundle and a project's `config.json` all reach
 * the store without passing a control. `sanitizeSettings` clamps against this
 * map, so every door inherits the same limit the UI has always shown.
 *
 * It is not a cosmetic concern: `terminalScrollback: -5` typed into the JSON
 * dialog made xterm throw inside `<Terminal>`'s render, which took the whole
 * window to the root error boundary — the entire app, not the pane.
 */
export const NUMBER_RANGES = {
  fontSize: FONT_SIZE_RANGE,
  lineHeight: LINE_HEIGHT_RANGE,
  letterSpacing: LETTER_SPACING_RANGE,
  rulerColumn: { min: 0, max: 200, default: 120 },
  largeFileGuardMb: { min: 0, max: 64, default: 2 },
  wrapColumn: { min: 0, max: 400, default: 0 },
  zoom: { min: 0.6, max: 2, default: 1 },
  mascotSize: { min: 90, max: 240, default: 160 },
  autoSaveDelay: { min: 200, max: 10_000, default: 1000 },
  terminalFontSize: { min: 8, max: 24, default: 12 },
  terminalScrollback: { min: 200, max: 100_000, default: 5000 },
} as const satisfies Record<string, { min: number; max: number; default: number }>

/**
 * Every setting whose value is one of a fixed set, and what that set is.
 *
 * Same reason as `NUMBER_RANGES` above, and the same door: `shapeMatches` in
 * `settingsJson` compares `typeof`, so `"colorVision": "protanopia"` is a
 * string and sails through — then `tokensFor` looks the mode up in its palette
 * table, finds nothing, and reading a token off `undefined` takes the whole
 * window to the root error boundary. A wrong word is as corrupting as a
 * negative number; it just looks more innocent.
 */
export const ENUM_VALUES = {
  lineNumbers: ["off", "on", "relative"],
  activeLine: ["off", "gutter", "line", "both"],
  indentGuides: ["off", "all", "active"],
  colorVision: ["normal", "red-green", "blue-yellow"],
  reduceMotion: ["system", "on", "off"],
  tabBar: ["multiple", "single", "hidden"],
  scrollbar: ["auto", "always", "hidden"],
  cursorStyle: ["line", "block", "underline"],
  cursorBlink: ["blink", "smooth", "solid"],
  explorerSort: ["name", "type", "modified"],
  mascotCorner: ["bottom-right", "bottom-left", "top-right", "top-left"],
  autoSave: ["off", "afterDelay", "onFocusChange"],
  defaultEol: ["auto", "LF", "CRLF"],
  sidebarSide: ["left", "right"],
  quickInputPosition: ["top", "center"],
  fileIcons: ["off", "mono", "colored"],
  logLevel: ["error", "warn", "info", "debug", "trace"],
  terminalCursorStyle: ["block", "bar", "underline"],
  mode: ["light", "dark", "system"],
} as const satisfies Record<string, readonly string[]>

/** How far the bottom panel runs across the window. See `panelAlignment`. */
export type PanelAlignment = "left" | "center" | "right" | "justify"

export interface SettingsState {
  /** Theme used when mode is "manual". */
  theme: ThemeName
  /** Light theme used by "system"/"auto" modes. */
  lightTheme: ThemeName
  /** Dark theme used by "system"/"auto" modes. */
  darkTheme: ThemeName
  mode: ThemeMode
  codeFont: string
  /** Editor text size in px (clamped to FONT_SIZE_RANGE on read). */
  fontSize: number
  /** Extra space between characters, in ems (clamped to LETTER_SPACING_RANGE). */
  letterSpacing: number
  /** Editor line height as a unitless multiplier (clamped to LINE_HEIGHT_RANGE). */
  lineHeight: number
  /** Gutter line numbers: hidden, absolute, or relative to the caret. */
  lineNumbers: "off" | "on" | "relative"
  /** Active-line emphasis: none, gutter only, line background only, or both. */
  activeLine: "off" | "gutter" | "line" | "both"
  /** Indentation guides: off, on all indentation, or only the active scope. */
  indentGuides: "off" | "all" | "active"
  /** Highlight the bracket matching the one at the caret. */
  bracketMatching: boolean
  /** Vertical guide at this column as a target max line length (0 = off). */
  rulerColumn: number
  /** Damp non-essential UI motion: follow the OS, force on, or force off. */
  /** Which colour pairs the reader cannot distinguish. Layers over the theme:
   *  only the colours that carry meaning on their own are retinted. */
  colorVision: "normal" | "red-green" | "blue-yellow"
  reduceMotion: "system" | "on" | "off"
  /** Announce what a sighted reader gets from the screen — the caret's line, a
   *  match count, a verdict — through a live region. Not auto-detected: a
   *  webview cannot see whether a screen reader is running, and guessing wrong
   *  either floods a reader who has one or silences one who does. */
  screenReader: boolean
  /** Short tones for an error under the caret and for a finished test run. */
  audioCues: boolean
  /** Editor tab strip: full row, single tab, or hidden. */
  tabBar: "multiple" | "single" | "hidden"
  /** Open a file you only clicked into as a *preview*: the next one you look at
   *  replaces it, so a session of reading doesn't leave forty tabs behind. */
  previewTabs: boolean
  /** Editor scrollbar visibility. */
  scrollbar: "auto" | "always" | "hidden"
  /** Caret shape. */
  cursorStyle: "line" | "block" | "underline"
  /** Caret blink behaviour. */
  cursorBlink: "blink" | "smooth" | "solid"
  /** Keep resolved comment threads visible, or hide them to declutter. */
  showResolvedComments: boolean
  /** Draw diagnostic squiggles inline (the Problems panel is unaffected). */
  inlineDiagnostics: boolean
  /** Glob patterns hidden from the file tree (and, unless `searchExcludeGlobs`
   *  overrides it, from project search too). */
  excludeGlobs: string[]
  /** Glob patterns excluded from project search only. Empty means "use
   *  `excludeGlobs`" — so the common case stays one list. */
  searchExcludeGlobs: string[]
  /** File-tree ordering within a folder (directories always come first). */
  explorerSort: "name" | "type" | "modified"
  /** Tuck generated files under the one that generated them, in the tree. */
  fileNesting: boolean
  /** The nesting rules, as `parent : child, child` lines. Empty means the set
   *  Reado ships (`DEFAULT_NESTING`); a project can share its own. */
  fileNestingRules: string[]
  /** Restore a project's tabs/scroll/caret on reopen, or start clean. */
  restoreSession: boolean
  /** File icons contributed by an extension, or null for Reado's own glyphs. */
  iconTheme: string | null
  /** Format the buffer with the project's formatter on save. */
  formatOnSave: boolean
  /** Re-indent pasted text to where it lands. */
  formatOnPaste: boolean
  /** Ask the language server to format after a character it names as a trigger. */
  formatOnType: boolean
  /** Trim trailing whitespace on save (never on read). */
  trimTrailingWhitespace: boolean
  /** Ensure a single final newline on save (never on read). */
  insertFinalNewline: boolean
  /** Don't open a text file above this many MB without asking; 0 disables. */
  largeFileGuardMb: number
  /** Annotate the cursor's line with who last changed it, and when. */
  inlineBlame: boolean
  /** Mark lines changed since the last commit in the editor gutter. */
  diffGutter: boolean
  /** Soft-focus the rest of the file around the cursor. */
  focusMode: boolean
  /** Select rectangles with a plain drag, without holding Alt (VS Code's
   *  column selection mode). Alt-drag selects a rectangle either way. */
  columnSelection: boolean
  /** Wrap long lines instead of scrolling horizontally. */
  wrap: boolean
  /** Where a wrapped line breaks: 0 = the editor's edge, otherwise that column
   *  (so the wrap point and the ruler agree however wide the window is). */
  wrapColumn: number
  /** Pin the enclosing scope headers while scrolling. */
  stickyScroll: boolean
  /** A clickable swatch beside every colour literal in the document. */
  colorSwatches: boolean
  /** Show the language server's code lenses (references, implementations, …)
   *  above the line they describe. Off means the server is never asked. */
  codeLens: boolean
  /** Colour from the language server on top of the grammar's colouring. Off
   *  means the server is never asked. */
  semanticTokens: boolean
  /** Interface zoom factor (1 = 100%). */
  zoom: number
  /** Version `.reado/` (except the rebuildable index) instead of gitignoring it. */
  versionReado: boolean
  /** Keyboard-shortcut overrides, as `combo = command` lines. Empty means the
   *  bindings Reado ships (`DEFAULT_BINDINGS`). */
  keybindings: string[]
  /** Suppress the first-comment gitignore prompt once the user opts out. */
  gitignoreDontAsk: boolean
  /** Play a soft chime when the agent finishes resolving tasks. */
  completionSound: boolean
  /** Show the mascot in its own always-on-top window. */
  mascot: boolean
  /** Which corner of the display it is parked in. Everything positional — which
   *  way its bubble opens, where the tail points — is derived from this one
   *  value, so all four corners work or none does. */
  mascotCorner: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  /** Its height in CSS pixels. */
  mascotSize: number
  /** Which display it is parked on, by the name the OS gives it. Empty: the one
   *  the main window is on, which is what someone who never opened this means. */
  mascotMonitor: string
  /** Automatically write edits to disk: never / after a short pause / on blur. */
  autoSave: "off" | "afterDelay" | "onFocusChange"
  /** How long "after a short pause" waits, in milliseconds. */
  autoSaveDelay: number
  /** Show the completion popup while typing, instead of only on ⌃Space. */
  suggestOnTyping: boolean
  /** Tint brackets by nesting depth. */
  bracketPairColors: boolean
  /** Line endings for files Reado creates; "auto" means the platform's. */
  defaultEol: "auto" | "LF" | "CRLF"
  /** Chrome visibility toggles (View menu). */
  /** Which edge the tool sidebar (and its activity bar) lives on. */
  sidebarSide: "left" | "right"
  showActivityBar: boolean
  showStatusBar: boolean
  showBreadcrumbs: boolean
  /** How wide the bottom panel runs: under the editor only (`center`), out to
   *  one edge of the workbench, or the full width (`justify`). The activity bar
   *  is never covered — it is the window's spine, not a region. */
  panelAlignment: PanelAlignment
  /** Status-bar indicators the user has hidden, by id (see `STATUS_ITEMS`). */
  hiddenStatusItems: string[]
  /** Where the command palette opens: pinned near the top, or centred. */
  quickInputPosition: "top" | "center"
  /** Zen mode: everything but the editor steps back. The chrome it hides is
   *  restored from `zenRestore` on the way out, so leaving zen returns the
   *  window you had rather than a default one. */
  zenMode: boolean
  zenRestore: {
    showActivityBar: boolean
    showStatusBar: boolean
    showBreadcrumbs: boolean
    centeredLayout: boolean
    tool: string | null
  } | null
  /** Hold the editor to a readable measure, with the slack as margin. */
  centeredLayout: boolean
  /** Show spaces/tabs as faint marks in the editor. */
  renderWhitespace: boolean
  /** Show the structure ribbon (symbols/comments/diagnostics overview column). */
  showRibbon: boolean
  /** File-tree icon style: generic glyph, per-type mono glyph, or tinted per type. */
  fileIcons: "off" | "mono" | "colored"
  /** Write a diagnostic log file you can send back to us (on by default). */
  logEnabled: boolean
  /** How much detail the log captures. */
  logLevel: "error" | "warn" | "info" | "debug" | "trace"
  /** Show hidden & git-ignored files in the tree (remembered across sessions). */
  showHidden: boolean
  /** Integrated-terminal appearance and behaviour. */
  terminalFontSize: number
  terminalScrollback: number
  terminalCursorStyle: "block" | "bar" | "underline"
  /** Shell to launch, or "" for the user's login shell. */
  terminalShell: string
  /** Extra arguments for `terminalShell`, one per entry. */
  terminalShellArgs: string[]
  /** Named shells a terminal can be opened with, as `Name = command args`
   *  lines. Empty means the one shell above, as it always was. */
  terminalProfiles: string[]
  /** The profile the plain "new terminal" action runs; "" means the shell
   *  setting (or the login shell). */
  defaultTerminalProfile: string
  /** Last-used guided-review objective, so it isn't re-picked every time. */
  reviewObjective: string
  /** The user dismissed the "make Reado the default app for text files" prompt. */
  defaultAppsDismissed: boolean
  set: (patch: Partial<SettingsState>) => void
  /** Put every preference back to how Reado ships. Choices that record a past
   *  interaction rather than a preference are kept — see {@link REMEMBERED}. */
  reset: () => void
}

/**
 * Not preferences: answers. Resetting these would re-ask a question the user has
 * already answered ("make Reado the default app?"), or throw away where they
 * were rather than how they like things.
 */
const REMEMBERED = [
  "defaultAppsDismissed",
  "gitignoreDontAsk",
  "reviewObjective",
  "zenMode",
  "zenRestore",
] as const

/** How Reado ships. Named so "reset" has something to reset *to*, and exported
 *  so the settings dialog can mark — and individually undo — what you changed. */
export const DEFAULTS = {
  theme: "reado-dark",
  lightTheme: "reado-light",
  darkTheme: "reado-dark",
  mode: "system",
  codeFont: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: 12,
  lineHeight: LINE_HEIGHT_RANGE.default,
  letterSpacing: LETTER_SPACING_RANGE.default,
  lineNumbers: "on",
  activeLine: "both",
  indentGuides: "all",
  bracketMatching: true,
  rulerColumn: 120,
  colorVision: "normal",
  reduceMotion: "system",
  screenReader: false,
  audioCues: false,
  tabBar: "multiple",
  previewTabs: true,
  scrollbar: "auto",
  cursorStyle: "line",
  cursorBlink: "smooth",
  showResolvedComments: true,
  inlineDiagnostics: true,
  excludeGlobs: [],
  searchExcludeGlobs: [],
  explorerSort: "name",
  fileNesting: false,
  fileNestingRules: [],
  restoreSession: true,
  iconTheme: null,
  formatOnSave: false,
  formatOnPaste: false,
  formatOnType: false,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  // 2 MB: comfortably above any file written by hand, comfortably below the
  // generated bundles and fixtures that make the editor crawl.
  largeFileGuardMb: 2,
  inlineBlame: false,
  diffGutter: false,
  focusMode: false,
  columnSelection: false,
  wrap: true,
  wrapColumn: 0,
  stickyScroll: true,
  colorSwatches: true,
  codeLens: true,
  semanticTokens: true,
  zoom: 1,
  versionReado: false,
  keybindings: [],
  gitignoreDontAsk: false,
  completionSound: false,
  mascot: false,
  mascotCorner: "bottom-right",
  mascotSize: 160,
  mascotMonitor: "",
  autoSave: "afterDelay",
  autoSaveDelay: 1000,
  suggestOnTyping: true,
  bracketPairColors: true,
  defaultEol: "auto",
  sidebarSide: "left",
  showActivityBar: true,
  showStatusBar: true,
  showBreadcrumbs: true,
  panelAlignment: "center",
  hiddenStatusItems: [],
  quickInputPosition: "top",
  zenMode: false,
  zenRestore: null,
  centeredLayout: false,
  renderWhitespace: false,
  showRibbon: true,
  fileIcons: "colored",
  logEnabled: true,
  logLevel: "info",
  showHidden: false,
  terminalFontSize: 12,
  terminalScrollback: 5000,
  terminalCursorStyle: "block",
  terminalShell: "",
  terminalProfiles: [],
  defaultTerminalProfile: "",
  terminalShellArgs: [],
  reviewObjective: "bug_risk",
  defaultAppsDismissed: false,
} satisfies Omit<SettingsState, "set" | "reset">

/** Whether a setting still holds the value Reado ships. Arrays are compared by
 *  content — `excludeGlobs` is a fresh array on every change, so identity would
 *  call an untouched list "modified". */
export function isDefaultSetting(key: keyof typeof DEFAULTS, s: SettingsState): boolean {
  const now = s[key] as unknown
  const def = DEFAULTS[key] as unknown
  if (Array.isArray(now) && Array.isArray(def)) {
    return now.length === def.length && now.every((v, i) => v === def[i])
  }
  return now === def
}

/**
 * Bring a persisted settings blob up to the current shape.
 *
 * Exported so the migrations can be tested: each one silently rewrites a value
 * someone is living with, and getting one wrong is invisible until a user says
 * a setting "reset itself".
 */
export function migrateSettings(state: unknown, version: number): SettingsState {
  const s = state as Partial<SettingsState>
  // v0 stored fileIcons as "plain" | "colored"; "plain" → per-type mono.
  if (version < 1 && (s.fileIcons as string) === "plain") s.fileIcons = "mono"
  // v2 added the editor reading controls; normalise the numeric ones so a
  // stale/corrupted persisted value can't reach the editor.
  if (version < 2) {
    s.fontSize = clampRange(Number(s.fontSize), FONT_SIZE_RANGE)
    s.lineHeight = clampRange(Number(s.lineHeight), LINE_HEIGHT_RANGE)
  }
  // v3 turns suggestions-as-you-type on. It shipped off, so every existing
  // install carries a stored `false` that would outlive the new default —
  // and that stored value was never a choice anyone made, it was just what
  // the editor came as. Someone who wants it quiet turns it off again, and
  // that choice survives (this runs once, on the way to v3).
  if (version < 3) s.suggestOnTyping = true
  // Every numeric setting, every load: a value that is out of range is out of
  // range however it got stored, and one of them (`terminalScrollback`) takes
  // the whole window to the error boundary the moment a terminal mounts. The
  // clamp is unconditional so a machine already carrying a poisoned value heals
  // on the next start rather than staying broken until someone finds the line.
  for (const [key, range] of Object.entries(NUMBER_RANGES)) {
    const k = key as keyof typeof NUMBER_RANGES
    if (s[k] !== undefined) (s as Record<string, number>)[k] = clampRange(Number(s[k]), range)
  }
  // And a stored word that is not one of the shipped ones: the same healing,
  // for the same reason — `colorVision: "protanopia"` blanked the window on the
  // next paint, and it survives a restart because it was persisted.
  for (const [key, allowed] of Object.entries(ENUM_VALUES)) {
    const k = key as keyof typeof ENUM_VALUES
    const v = (s as Record<string, unknown>)[k]
    if (v !== undefined && !(allowed as readonly string[]).includes(v as string)) {
      ;(s as Record<string, unknown>)[k] = DEFAULTS[k]
    }
  }
  return s as SettingsState
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      reset: () =>
        set({
          ...DEFAULTS,
          ...Object.fromEntries(REMEMBERED.map((k) => [k, get()[k]])),
        } as Partial<SettingsState>),
    }),
    {
      name: "reado.settings",
      version: 3,
      migrate: migrateSettings,
    },
  ),
)
