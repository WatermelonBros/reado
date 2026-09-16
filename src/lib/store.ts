/**
 * Application state.
 *
 * Three persisted slices:
 *   - `useSettings` — global UI preferences (theme, fonts, reading aids).
 *   - `useRecents`  — recently opened projects, most-recent first.
 *   - `useSessions` — per-project session (open tabs + active file) for restore.
 *
 * Live, non-persisted project state (the loaded git info, the in-memory tab
 * list of the *current* window) lives in `useProject`.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ExtListing, GitInfo } from "./api"
import { baseName } from "./comments"
import { findPanel, useLayout } from "./layout"

export type BuiltinTheme = "reado-dark" | "reado-light" | "reado-high-contrast" | "reado-sepia"

/** A theme contributed by an installed extension: `ext:{extensionId}:{label}`.
 *  Kept as a template literal type so it stays distinguishable from a built-in
 *  at every use site instead of widening the whole setting to `string`. */
export type ExtThemeName = `ext:${string}`

export type ThemeName = BuiltinTheme | ExtThemeName

/** Whether a chosen theme comes from an extension rather than from Reado. */
export const isExtTheme = (t: ThemeName): t is ExtThemeName => t.startsWith("ext:")

export type ThemeMode = "manual" | "system" | "auto"

/**
 * An extension being read in the editor area.
 *
 * Every row opens one, whichever catalogue it came from. A curated tool has no
 * README, but it has everything else a reader wants before deciding — what it
 * adds, what it needs, how it gets installed — and a list where only some rows
 * respond to a click reads as broken, not as principled.
 */
export type ReadingExtension =
  | { kind: "registry"; namespace: string; name: string; version?: string; listing?: ExtListing }
  | { kind: "curated"; id: string }

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

export interface RecentProject {
  path: string
  name: string
  /** Epoch millis of last open, for ordering. */
  openedAt: number
}

interface RecentsState {
  projects: RecentProject[]
  touch: (path: string) => void
  remove: (path: string) => void
}

export const useRecents = create<RecentsState>()(
  persist(
    (set) => ({
      projects: [],
      touch: (path) =>
        set((s) => {
          const rest = s.projects.filter((p) => p.path !== path)
          return {
            projects: [{ path, name: baseName(path), openedAt: Date.now() }, ...rest].slice(0, 30),
          }
        }),
      remove: (path) => set((s) => ({ projects: s.projects.filter((p) => p.path !== path) })),
    }),
    { name: "reado.recents" },
  ),
)

export interface Session {
  /** Open file paths, in tab order. */
  tabs: string[]
  /** Active file path, or null. */
  active: string | null
  /** Per-file editor scroll offset (px), so reopening returns to where you were. */
  scroll?: Record<string, number>
  /** Per-file cursor position, so reopening restores the caret (not just scroll). */
  cursor?: Record<string, { line: number; col: number }>
  /** Expanded directory paths in the tree, so the drill-down survives a reopen. */
  expanded?: string[]
  /** The file shown in the split pane, so a side-by-side comparison survives. */
  split?: string | null
  /** The editor groups, so a three-pane arrangement comes back too. */
  groups?: EditorGroup[]
  focusedGroup?: string
}

interface SessionsState {
  byRoot: Record<string, Session>
  save: (root: string, session: Session) => void
  /** Remember the editor scroll offset for a file (merged into its session). */
  saveScroll: (root: string, path: string, top: number) => void
  /** Remember the cursor position for a file. */
  saveCursor: (root: string, path: string, line: number, col: number) => void
}

export const useSessions = create<SessionsState>()(
  persist(
    (set) => ({
      byRoot: {},
      // Preserve the per-file maps (scroll/cursor) and drill-down state when
      // tabs/active change, so a plain tab save never wipes them.
      save: (root, session) =>
        set((s) => {
          const prev = s.byRoot[root]
          return {
            byRoot: {
              ...s.byRoot,
              [root]: {
                ...session,
                scroll: session.scroll ?? prev?.scroll,
                cursor: session.cursor ?? prev?.cursor,
                expanded: session.expanded ?? prev?.expanded,
                split: session.split ?? prev?.split,
              },
            },
          }
        }),
      saveScroll: (root, path, top) =>
        set((s) => {
          const prev = s.byRoot[root] ?? { tabs: [], active: null }
          return {
            byRoot: {
              ...s.byRoot,
              [root]: { ...prev, scroll: { ...prev.scroll, [path]: top } },
            },
          }
        }),
      saveCursor: (root, path, line, col) =>
        set((s) => {
          const prev = s.byRoot[root] ?? { tabs: [], active: null }
          return {
            byRoot: {
              ...s.byRoot,
              [root]: { ...prev, cursor: { ...prev.cursor, [path]: { line, col } } },
            },
          }
        }),
    }),
    { name: "reado.sessions" },
  ),
)

export type Tool =
  | "files"
  | "search"
  | "comments"
  | "outline"
  | "git"
  | "orphans"
  | "specs"
  | "problems"
  | "bookmarks"
  | "hierarchy"
  | "timeline"
  | "qa"
  | "tours"
  | "prereview"
  | "guidedreview"
  | "coverage"
  | "tests"
  | "extensions"
  | "output"

interface WorkspaceState {
  /** Active side-panel tool, or null when the panel is collapsed. */
  tool: Tool | null
  /** The tool to restore when re-opening a collapsed sidebar. */
  lastTool: Tool
  /** Select a tool; selecting the active one collapses the panel. */
  selectTool: (tool: Tool) => void
  /** Collapse the sidebar, or restore the last tool (Ctrl+B). */
  toggleSidebar: () => void
  /** A query to seed the search panel (find references), consumed on read. */
  pendingSearch: string | null
  searchFor: (query: string) => void
  clearPendingSearch: () => void
  /** Project-relative folder the Search panel is limited to, or null for the
   *  whole project. Set by "Find in Folder" in the tree, cleared in the panel. */
  searchScope: string | null
  setSearchScope: (scope: string | null) => void
  /** The extension whose page is open in the editor area, if any. The listing
   *  rides along when the page was opened from a catalogue row, so the page can
   *  offer Install without asking the registry a second time. */
  readingExtension: ReadingExtension | null
  readExtension: (ext: ReadingExtension | null) => void
  /** Whether the knowledge-graph overlay is open. */
  graphOpen: boolean
  /** The commit graph overlay (the repository's shape, not the project's). */
  gitGraphOpen: boolean
  toggleGitGraph: (open?: boolean) => void
  toggleGraph: (open?: boolean) => void
  /** Whether the documentation overlay is open. */
  docsOpen: boolean
  toggleDocs: (open?: boolean) => void
  /** Side-panel width in px (drag-resizable), persisted. */
  sidebarWidth: number
  setSidebarWidth: (px: number) => void
  /** Comments-panel filters, remembered so a tool-switch doesn't reset them. */
  commentFilter: { view: "open" | "history"; type: string; state: string; thisFile: boolean }
  setCommentFilter: (patch: Partial<WorkspaceState["commentFilter"]>) => void
  /** Last search-panel query, so leaving and returning doesn't lose it. */
  searchQuery: string
  setSearchQuery: (q: string) => void
  /** Queries actually run, newest first — ↑/↓ in the search field walks them. */
  searchHistory: string[]
  pushSearchHistory: (q: string) => void
  /** "Files to include" / "files to exclude" globs for the search panel,
   *  remembered like the query. Comma- or space-separated. */
  searchInclude: string
  searchExclude: string
  setSearchGlobs: (patch: { include?: string; exclude?: string }) => void
  /** User's custom activity-bar order (tool ids). Tools not listed keep their
   *  natural order after the listed ones. Empty = default order. */
  toolOrder: Tool[]
  setToolOrder: (order: Tool[]) => void
  /** Extension ids this project recommends and that aren't installed. Read
   *  from `.reado/extensions.json` on open; the Extensions panel surfaces them. */
  recommended: string[]
  setRecommended: (ids: string[]) => void
  /** Views the user has hidden from the activity bar. They stay reachable from
   *  View ▸ Open View and the command palette — hiding is about the rail. */
  hiddenTools: Tool[]
  hideTool: (tool: Tool) => void
  showAllTools: () => void
}

/** Tool sidebar state (which side panel is shown), persisted per user. */
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      tool: "files",
      lastTool: "files",
      selectTool: (tool) => {
        // A tool the user has docked lives there now: bring it forward in its
        // dock group instead of a second copy appearing in the sidebar. Unhide
        // the region first — a docked tool whose region is collapsed would
        // otherwise make the activity-bar button look dead. Its neighbours keep
        // running: a dock group shows one tab and closes none of them.
        const at = findPanel(useLayout.getState().layout, tool)
        if (at) {
          useLayout.getState().toggleArea(at.area, false)
          useLayout.getState().activate(tool)
          return
        }
        set((s) => (s.tool === tool ? { tool: null } : { tool, lastTool: tool }))
      },
      toggleSidebar: () => set((s) => (s.tool ? { tool: null } : { tool: s.lastTool })),
      pendingSearch: null,
      searchFor: (query) => set({ tool: "search", lastTool: "search", pendingSearch: query }),
      clearPendingSearch: () => set({ pendingSearch: null }),
      searchScope: null,
      setSearchScope: (searchScope) => set({ searchScope }),
      readingExtension: null,
      readExtension: (readingExtension) => set({ readingExtension }),
      graphOpen: false,
      toggleGraph: (open) => set((s) => ({ graphOpen: open ?? !s.graphOpen })),
      gitGraphOpen: false,
      toggleGitGraph: (open) => set((s) => ({ gitGraphOpen: open ?? !s.gitGraphOpen })),
      docsOpen: false,
      toggleDocs: (open) => set((s) => ({ docsOpen: open ?? !s.docsOpen })),
      sidebarWidth: 264,
      // Clamp so the panel stays usable and never crowds out the editor. `px` is a
      // layout pixel; convert the viewport width by the interface zoom so the cap
      // is right at zoom ≠ 1.
      setSidebarWidth: (px) =>
        set({
          sidebarWidth: Math.max(
            180,
            Math.min(px, window.innerWidth / (useSettings.getState().zoom || 1) - 360),
          ),
        }),
      commentFilter: { view: "open", type: "all", state: "all", thisFile: false },
      setCommentFilter: (patch) =>
        set((s) => ({ commentFilter: { ...s.commentFilter, ...patch } })),
      searchQuery: "",
      searchHistory: [],
      // Newest first, de-duplicated, and bounded: this is a convenience list,
      // not a log.
      pushSearchHistory: (q) =>
        set((s) => {
          const query = q.trim()
          if (!query) return s
          return {
            searchHistory: [query, ...s.searchHistory.filter((h) => h !== query)].slice(0, 25),
          }
        }),
      searchInclude: "",
      searchExclude: "",
      setSearchGlobs: ({ include, exclude }) =>
        set((s) => ({
          searchInclude: include ?? s.searchInclude,
          searchExclude: exclude ?? s.searchExclude,
        })),
      setSearchQuery: (q) => set({ searchQuery: q }),
      recommended: [],
      setRecommended: (recommended) => set({ recommended }),
      hiddenTools: [],
      hideTool: (tool) =>
        set((s) => ({
          hiddenTools: s.hiddenTools.includes(tool)
            ? s.hiddenTools.filter((x) => x !== tool)
            : [...s.hiddenTools, tool],
          // Hiding the view you are looking at would leave the sidebar showing
          // a panel with no way back to it.
          tool: s.tool === tool ? null : s.tool,
        })),
      showAllTools: () => set({ hiddenTools: [] }),
      toolOrder: [],
      setToolOrder: (order) => set({ toolOrder: order }),
    }),
    {
      name: "reado.workspace",
      partialize: (s) => ({
        tool: s.tool,
        sidebarWidth: s.sidebarWidth,
        commentFilter: s.commentFilter,
        searchQuery: s.searchQuery,
        toolOrder: s.toolOrder,
      }),
    },
  ),
)

/** One editor group: its own tabs, its own active file, its own history. */
export interface EditorGroup {
  id: string
  tabs: string[]
  active: string | null
  navStack: { path: string; line?: number }[]
  navIndex: number
}

export type PaletteMode =
  | "commands"
  | "files"
  | "symbols"
  | "wsymbols"
  | "recents"
  | "bookmarks"
  | "profiles"
  | "tasks"
  | null

interface PaletteState {
  mode: PaletteMode
  /** True while the settings panel is shown. */
  settingsOpen: boolean
  /** The settings dialog's JSON view. A flag here rather than local state so the
   *  command palette can open straight onto it. */
  settingsJsonOpen: boolean
  /** True while the keyboard-shortcuts reference is shown. */
  shortcutsOpen: boolean
  /** True while the Reado Anywhere (phone pairing) dialog is shown. */
  anywhereOpen: boolean
  open: (mode: Exclude<PaletteMode, null>) => void
  close: () => void
  toggleSettings: (open?: boolean) => void
  /** Open the settings dialog on its JSON view (or close that view). */
  toggleSettingsJson: (open?: boolean) => void
  toggleShortcuts: (open?: boolean) => void
  toggleAnywhere: (open?: boolean) => void
}

/** Drives the quick-open palette (commands / files / search) and settings. */
export const usePalette = create<PaletteState>((set) => ({
  mode: null,
  settingsOpen: false,
  settingsJsonOpen: false,
  shortcutsOpen: false,
  anywhereOpen: false,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
  toggleSettings: (open) =>
    set((s) => ({
      settingsOpen: open ?? !s.settingsOpen,
      // Closing the dialog closes the view it was showing, so reopening lands
      // on the tabs rather than on a JSON blob nobody asked for again.
      settingsJsonOpen: open === false ? false : s.settingsJsonOpen,
      mode: null,
    })),
  toggleSettingsJson: (open) =>
    set((s) => {
      const next = open ?? !s.settingsJsonOpen
      return { settingsJsonOpen: next, settingsOpen: next || s.settingsOpen, mode: null }
    }),
  toggleShortcuts: (open) => set((s) => ({ shortcutsOpen: open ?? !s.shortcutsOpen, mode: null })),
  toggleAnywhere: (open) => set((s) => ({ anywhereOpen: open ?? !s.anywhereOpen, mode: null })),
}))

interface EditorActionsState {
  /** Bumped to request the active code view to open the comment composer. */
  composeNonce: number
  requestCompose: () => void
  /** Bumped to ask the active view to explain the current selection with AI. */
  explainNonce: number
  requestExplain: () => void
  /** Bumped to ask the active view to peek the definition at the cursor. */
  peekNonce: number
  requestPeek: () => void
  /** Bumped to open the code-action menu at the cursor (⌘.). */
  quickFixNonce: number
  requestQuickFix: () => void
  /** Manual editing enabled for the active file (read-first stays the default). */
  editing: boolean
  setEditing: (editing: boolean) => void
  /** Project-relative paths with unsaved changes. Per file, not global: the
   *  split pane edits a different file than the primary one, and a single flag
   *  made one pane's edits invisible to the other's auto-save. */
  dirtyPaths: string[]
  setDirty: (path: string, dirty: boolean) => void
  isDirty: (path: string) => boolean
  /** Show the active file as a diff against its committed version. */
  diffing: boolean
  setDiffing: (diffing: boolean) => void
  /** Show the conflict resolver for the active file instead of the editor. */
  resolvingConflict: boolean
  setResolvingConflict: (on: boolean) => void
  /**
   * The view the *next* opened file should land in, consumed once by the
   * editor.
   *
   * Opening a file and choosing its view are one intent, but two state writes:
   * the editor resets to the plain view whenever the active file changes, so a
   * caller that opened a file and then asked for the diff had its request wiped
   * by that reset — and only stuck on a second click, when the file was already
   * active and the reset didn't fire. Saying it up front removes the race.
   */
  pendingView: "diff" | "conflict" | null
  requestView: (view: "diff" | "conflict") => void
  /** Take the pending view, if any, leaving nothing behind for the next file. */
  takePendingView: () => "diff" | "conflict" | null
  /** The git ref the diff compares against (HEAD, a branch, or a commit hash),
   *  or one of the sentinels: the last-read snapshot, or what is on disk. */
  diffBase: string
  setDiffBase: (base: string) => void
  /** The unsaved buffer to diff, captured when "Compare with Saved" ran. Null
   *  when the diff is against a git ref, where the file on disk is the doc. */
  compareBuffer: string | null
  setCompareBuffer: (text: string | null) => void
  /** Show a per-line git blame gutter in the editor. */
  blame: boolean
  setBlame: (blame: boolean) => void
}

/** Bridge for triggering editor actions from outside the editor (e.g. global
 *  shortcuts or the command palette), without coupling to the editor's focus.
 *  `blame` and `diffBase` are persisted so a preferred view survives a restart;
 *  the transient nonces / dirty / diffing / editing flags are not. */
export const useEditorActions = create<EditorActionsState>()(
  persist(
    (set, get) => ({
      composeNonce: 0,
      requestCompose: () => set((s) => ({ composeNonce: s.composeNonce + 1 })),
      explainNonce: 0,
      requestExplain: () => set((s) => ({ explainNonce: s.explainNonce + 1 })),
      peekNonce: 0,
      requestPeek: () => set((s) => ({ peekNonce: s.peekNonce + 1 })),
      quickFixNonce: 0,
      requestQuickFix: () => set((s) => ({ quickFixNonce: s.quickFixNonce + 1 })),
      editing: false,
      setEditing: (editing) => set({ editing }),
      dirtyPaths: [],
      setDirty: (path, dirty) =>
        set((s) => {
          const has = s.dirtyPaths.includes(path)
          if (has === dirty) return s
          return {
            dirtyPaths: dirty ? [...s.dirtyPaths, path] : s.dirtyPaths.filter((p) => p !== path),
          }
        }),
      isDirty: (path) => get().dirtyPaths.includes(path),
      diffing: false,
      // Conflict resolution and the diff are two views of the same file; opening
      // one closes the other rather than stacking them.
      setDiffing: (diffing) => set({ diffing, resolvingConflict: false }),
      resolvingConflict: false,
      setResolvingConflict: (resolvingConflict) => set({ resolvingConflict, diffing: false }),
      pendingView: null,
      requestView: (pendingView) => set({ pendingView }),
      takePendingView: () => {
        const view = get().pendingView
        if (view) set({ pendingView: null })
        return view
      },
      diffBase: "HEAD",
      setDiffBase: (base) => set({ diffBase: base }),
      compareBuffer: null,
      setCompareBuffer: (compareBuffer) => set({ compareBuffer }),
      blame: false,
      setBlame: (blame) => set({ blame }),
    }),
    {
      name: "reado.editor",
      partialize: (s) => ({ blame: s.blame, diffBase: s.diffBase }),
    },
  ),
)

/** Diff base sentinel: the file as it is on disk, so unsaved edits can be seen
 *  as a diff ("Compare with Saved"). Not a git ref — no repository needed. */
export const SAVED_BASE = "reado:saved"

/** Diff base prefix for "compare these two files": the rest of the string is
 *  the project-relative path of the *other* file. Same sentinel shape as
 *  `SAVED_BASE`/`LAST_READ_BASE`, so a base is still one string. */
export const FILE_BASE = "reado:file:"

/** Diff base prefix for a local-history entry: the rest of the string is the
 *  copy's stamp. Same sentinel shape as the others — a base is one string. */
export const HISTORY_BASE = "reado:history:"

interface CursorState {
  line: number
  col: number
  set: (line: number, col: number) => void
}

/** Cursor position of the focused editor, shown in the status bar. Kept in its
 *  own store so frequent cursor moves don't re-render the whole project tree. */
export const useCursor = create<CursorState>((set) => ({
  line: 1,
  col: 1,
  set: (line, col) => set({ line, col }),
}))

/** A single thing to jump to after navigation, for the landing highlight. */
export interface Landing {
  path: string
  line: number
  /** Bumped on every jump so repeated jumps to the same line re-trigger. */
  nonce: number
}

interface ProjectState {
  /**
   * The primary folder: the one whose `.reado/` holds the workspace list, and
   * the one every root-scoped call falls back to.
   *
   * Most code should ask `rootFor(path)` instead — with more than one folder
   * open, "the root" is a property of the file you are acting on, not of the
   * window.
   */
  root: string
  /** Every folder in the workspace, primary first. */
  roots: string[]
  /** The `.reado-workspace` file this window was opened from, when it was. The
   *  folder list is written back there instead of to a folder's `.reado/`. */
  workspaceFile: string | null
  setWorkspaceFile: (path: string | null) => void
  /** Add a folder to the workspace (no-op if it is already there). */
  addRoot: (path: string) => void
  /** Remove a folder. The primary one can't be removed — that is "close
   *  project", a different thing. */
  removeRoot: (path: string) => void
  git: GitInfo
  tabs: string[]
  active: string | null
  showHidden: boolean
  landing: Landing | null
  /** Bumped to make the file tree re-list directories (external/internal changes). */
  treeNonce: number
  bumpTree: () => void
  /** Bumped to collapse every expanded folder in the tree. */
  collapseNonce: number
  collapseTree: () => void
  /** Expanded directory paths in the tree (persisted per project via Session). */
  expandedDirs: string[]
  /** Toggle a directory's expansion (and remember it). */
  toggleDir: (path: string, open?: boolean) => void
  /** Back/forward history of visited locations, and the cursor into it. */
  navStack: { path: string; line?: number }[]
  navIndex: number
  goBack: () => void
  goForward: () => void
  /** Recently closed tabs (newest last), for reopen. */
  closedTabs: string[]
  reopenClosed: () => void
  /** Cycle the active tab in order (Ctrl+Tab / Ctrl+Shift+Tab). */
  cycleTab: (dir: 1 | -1) => void
  /**
   * Editor groups beyond the focused one.
   *
   * The focused group's tabs, active file and history are the fields above:
   * every reader and writer in the app already works on them, and a second
   * description of "the open files" would be one more thing to keep in step.
   * Focusing another group writes those fields into the group being left and
   * loads the next one's — the same save-then-load that makes profiles safe.
   */
  groups: EditorGroup[]
  /** Which group the fields above belong to. */
  focusedGroup: string
  /** Put the focused file in a new group to its right. */
  splitGroup: () => void
  /** Focus a group by id, or by position (0-based) for ⌘1…⌘9. */
  focusGroup: (idOrIndex: string | number) => void
  /** Act on a tab of a group that is not focused: focus it first, so everything
   *  downstream is the ordinary single-group case. */
  activateInGroup: (groupId: string, path: string) => void
  closeInGroup: (groupId: string, path: string) => void
  /** A second file shown side-by-side, or null when not split. */
  splitPath: string | null
  /** Open the split pane (defaults to the current file), or set its file. */
  openSplit: (path?: string) => void
  closeSplit: () => void
  /** Swap which file is primary (left) and which is in the split (right). */
  swapSplit: () => void
  init: (root: string, git: GitInfo, session?: Session, roots?: string[]) => void
  setGit: (git: GitInfo) => void
  /** Open a file as a *preview* tab: it replaces the previous preview instead
   *  of adding to the strip, and the next preview replaces it. That is what
   *  keeps a session of reading from turning into forty tabs. */
  openPreview: (path: string, line?: number) => void
  /** The tab currently in preview, if any. */
  previewPath: string | null
  /** Promote the preview tab to an ordinary one ("keep it open"). */
  keepOpen: (path: string) => void
  /** Tabs the user has pinned. They sort first and survive the bulk closes. */
  pinnedTabs: string[]
  togglePinned: (path: string) => void
  open: (path: string, line?: number) => void
  close: (path: string) => void
  /** Repoint an open tab after its file moved on disk. */
  renamePath: (from: string, to: string) => void
  /** Close every tab except `path` (becomes active). */
  closeOthers: (path: string) => void
  /** Close the tabs to the right of `path`. */
  closeToRight: (path: string) => void
  /** Close all tabs. */
  closeAll: () => void
  /** Reorder an open tab: move `path` to just before `beforePath` (or to the end
   *  when `beforePath` is null). Drag-and-drop in the tab strip. */
  moveTab: (path: string, beforePath: string | null) => void
  setActive: (path: string) => void
  setShowHidden: (show: boolean) => void
}

export const useProject = create<ProjectState>((set, get) => ({
  root: "",
  git: {
    isRepo: false,
    branch: null,
    ahead: 0,
    behind: 0,
    hasRemote: false,
    hasUpstream: false,
    changedFiles: 0,
  },
  tabs: [],
  active: null,
  showHidden: false,
  landing: null,
  treeNonce: 0,
  bumpTree: () => set((s) => ({ treeNonce: s.treeNonce + 1 })),
  collapseNonce: 0,
  collapseTree: () => set((s) => ({ collapseNonce: s.collapseNonce + 1, expandedDirs: [] })),
  expandedDirs: [],
  toggleDir: (path, open) =>
    set((s) => {
      const has = s.expandedDirs.includes(path)
      const want = open ?? !has
      if (want === has) return s
      return {
        expandedDirs: want ? [...s.expandedDirs, path] : s.expandedDirs.filter((p) => p !== path),
      }
    }),
  navStack: [],
  navIndex: -1,
  closedTabs: [],
  goBack: () =>
    set((s) => {
      if (s.navIndex <= 0) return s
      const navIndex = s.navIndex - 1
      const e = s.navStack[navIndex]
      return {
        navIndex,
        tabs: s.tabs.includes(e.path) ? s.tabs : [...s.tabs, e.path],
        active: e.path,
        landing:
          e.line !== undefined
            ? { path: e.path, line: e.line, nonce: (s.landing?.nonce ?? 0) + 1 }
            : s.landing,
      }
    }),
  goForward: () =>
    set((s) => {
      if (s.navIndex >= s.navStack.length - 1) return s
      const navIndex = s.navIndex + 1
      const e = s.navStack[navIndex]
      return {
        navIndex,
        tabs: s.tabs.includes(e.path) ? s.tabs : [...s.tabs, e.path],
        active: e.path,
        landing:
          e.line !== undefined
            ? { path: e.path, line: e.line, nonce: (s.landing?.nonce ?? 0) + 1 }
            : s.landing,
      }
    }),
  reopenClosed: () =>
    set((s) => {
      if (s.closedTabs.length === 0) return s
      const closedTabs = s.closedTabs.slice(0, -1)
      const path = s.closedTabs[s.closedTabs.length - 1]
      return {
        closedTabs,
        tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path],
        active: path,
      }
    }),
  cycleTab: (dir) =>
    set((s) => {
      if (s.tabs.length < 2) return s
      const i = s.active ? s.tabs.indexOf(s.active) : 0
      const next = (i + dir + s.tabs.length) % s.tabs.length
      return { active: s.tabs[next] }
    }),
  groups: [{ id: "g1", tabs: [], active: null, navStack: [], navIndex: -1 }],
  focusedGroup: "g1",
  splitGroup: () =>
    set((s) => {
      const id = `g${Math.max(0, ...s.groups.map((g) => Number(g.id.slice(1)) || 0)) + 1}`
      const at = s.groups.findIndex((g) => g.id === s.focusedGroup)
      // The new group opens on the file you were reading, which is what makes a
      // split useful the instant it appears rather than a blank pane to fill.
      const seed = s.active
      const group: EditorGroup = {
        id,
        tabs: seed ? [seed] : [],
        active: seed,
        navStack: seed ? [{ path: seed }] : [],
        navIndex: seed ? 0 : -1,
      }
      const groups = [...s.groups]
      // Write the live fields back into the group being left, so nothing that
      // happened while it was focused is lost to the split.
      groups[at] = {
        ...groups[at],
        tabs: s.tabs,
        active: s.active,
        navStack: s.navStack,
        navIndex: s.navIndex,
      }
      groups.splice(at + 1, 0, group)
      return {
        groups,
        focusedGroup: id,
        tabs: group.tabs,
        active: group.active,
        navStack: group.navStack,
        navIndex: group.navIndex,
      }
    }),
  focusGroup: (idOrIndex) =>
    set((s) => {
      const target =
        typeof idOrIndex === "number"
          ? s.groups[idOrIndex]
          : s.groups.find((g) => g.id === idOrIndex)
      if (!target || target.id === s.focusedGroup) return s
      const groups = s.groups.map((g) =>
        g.id === s.focusedGroup
          ? { ...g, tabs: s.tabs, active: s.active, navStack: s.navStack, navIndex: s.navIndex }
          : g,
      )
      return {
        groups,
        focusedGroup: target.id,
        tabs: target.tabs,
        active: target.active,
        navStack: target.navStack,
        navIndex: target.navIndex,
      }
    }),
  activateInGroup: (groupId, path) => {
    const s = get()
    if (groupId !== s.focusedGroup) s.focusGroup(groupId)
    get().open(path)
  },
  closeInGroup: (groupId, path) => {
    const s = get()
    if (groupId !== s.focusedGroup) s.focusGroup(groupId)
    get().close(path)
  },
  splitPath: null,
  openSplit: (path) => set((s) => ({ splitPath: path ?? s.active })),
  closeSplit: () => set({ splitPath: null }),
  swapSplit: () => set((s) => (s.splitPath ? { active: s.splitPath, splitPath: s.active } : s)),
  init: (root, git, session, roots) =>
    set({
      root,
      roots: roots?.length ? [root, ...roots.filter((r) => r !== root)] : [root],
      git,
      tabs: session?.tabs ?? [],
      active: session?.active ?? null,
      // A three-pane arrangement is part of where you left off, like the tabs.
      groups: session?.groups?.length
        ? session.groups
        : [
            {
              id: "g1",
              tabs: session?.tabs ?? [],
              active: session?.active ?? null,
              navStack: session?.active ? [{ path: session.active }] : [],
              navIndex: session?.active ? 0 : -1,
            },
          ],
      focusedGroup: session?.focusedGroup ?? session?.groups?.[0]?.id ?? "g1",
      // Restore the per-project drill-down, split, and hidden-files preference so
      // reopening a repo lands where you left it rather than fully collapsed.
      expandedDirs: session?.expanded ?? [],
      splitPath: session?.split ?? null,
      showHidden: useSettings.getState().showHidden,
      navStack: session?.active ? [{ path: session.active }] : [],
      navIndex: session?.active ? 0 : -1,
      closedTabs: [],
      previewPath: null,
      pinnedTabs: [],
    }),
  setGit: (git) => set({ git }),
  roots: [],
  workspaceFile: null,
  setWorkspaceFile: (path) => set({ workspaceFile: path }),
  addRoot: (path) => set((s) => (s.roots.includes(path) ? s : { roots: [...s.roots, path] })),
  removeRoot: (path) =>
    set((s) => {
      // The primary folder owns the workspace file and the annotations; taking
      // it out would leave the window with nowhere to write them.
      if (path === s.root) return s
      return {
        roots: s.roots.filter((r) => r !== path),
        // Files from a folder that is no longer in the workspace can't stay
        // open: nothing would know which root to save them against.
        tabs: s.tabs.filter((t) => !t.startsWith(`${path}/`)),
        active: s.active?.startsWith(`${path}/`) ? null : s.active,
      }
    }),
  previewPath: null,
  pinnedTabs: [],
  keepOpen: (path) => set((s) => (s.previewPath === path ? { previewPath: null } : s)),
  togglePinned: (path) =>
    set((s) => ({
      pinnedTabs: s.pinnedTabs.includes(path)
        ? s.pinnedTabs.filter((p) => p !== path)
        : [...s.pinnedTabs, path],
      // Pinning is a decision to keep the file: it can't stay a preview.
      previewPath: s.previewPath === path ? null : s.previewPath,
    })),
  open: (path, line) =>
    set((s) => {
      const tabs = s.tabs.includes(path) ? s.tabs : [...s.tabs, path]
      // Record into history: truncate any forward entries, collapse a repeat of
      // the current path (just update its line), and cap the depth.
      const cur = s.navStack[s.navIndex]
      let navStack = s.navStack
      let navIndex = s.navIndex
      if (!cur || cur.path !== path) {
        navStack = [...s.navStack.slice(0, s.navIndex + 1), { path, line }].slice(-50)
        navIndex = navStack.length - 1
      } else if (line !== undefined) {
        navStack = [...s.navStack]
        navStack[s.navIndex] = { path, line }
      }
      return {
        tabs,
        active: path,
        // Opening a file outright is a decision to keep it — even if it was
        // already sitting there as a preview.
        previewPath: s.previewPath === path ? null : s.previewPath,
        landing:
          line !== undefined ? { path, line, nonce: (s.landing?.nonce ?? 0) + 1 } : s.landing,
        navStack,
        navIndex,
      }
    }),
  openPreview: (path, line) =>
    set((s) => {
      if (!useSettings.getState().previewTabs) {
        get().open(path, line)
        return {}
      }
      // Replace the outgoing preview in place, so the strip doesn't reshuffle
      // as you arrow through a folder. A pinned or already-open file is left
      // exactly where it is.
      const previous = s.previewPath
      const already = s.tabs.includes(path)
      const tabs = already
        ? s.tabs
        : previous && s.tabs.includes(previous)
          ? s.tabs.map((t) => (t === previous ? path : t))
          : [...s.tabs, path]
      const cur = s.navStack[s.navIndex]
      let navStack = s.navStack
      let navIndex = s.navIndex
      if (!cur || cur.path !== path) {
        navStack = [...s.navStack.slice(0, s.navIndex + 1), { path, line }].slice(-50)
        navIndex = navStack.length - 1
      }
      return {
        tabs,
        active: path,
        // An already-open tab keeps whatever status it had; a new one is the
        // preview until something promotes it.
        previewPath: already ? s.previewPath : path,
        landing:
          line !== undefined ? { path, line, nonce: (s.landing?.nonce ?? 0) + 1 } : s.landing,
        navStack,
        navIndex,
      }
    }),
  close: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== path)
      const active = s.active === path ? (tabs[tabs.length - 1] ?? null) : s.active
      const common = {
        previewPath: s.previewPath === path ? null : s.previewPath,
        pinnedTabs: s.pinnedTabs.filter((p) => p !== path),
        closedTabs: [...s.closedTabs, path].slice(-25),
      }
      // A group with nothing left in it is a pane showing nothing; it goes, and
      // a neighbour takes the focus. Except the last one — an editor with no
      // group at all is not a state anything downstream expects.
      if (!tabs.length && s.groups.length > 1) {
        const at = s.groups.findIndex((g) => g.id === s.focusedGroup)
        const groups = s.groups.filter((g) => g.id !== s.focusedGroup)
        const next = groups[Math.min(at, groups.length - 1)]
        return {
          ...common,
          groups,
          focusedGroup: next.id,
          tabs: next.tabs,
          active: next.active,
          navStack: next.navStack,
          navIndex: next.navIndex,
        }
      }
      return { ...common, tabs, active }
    }),
  // The bulk closes spare pinned tabs: pinning is the user saying "not this
  // one", and a bulk action that ignores that makes the pin worthless.
  closeOthers: (path) =>
    set((s) => {
      if (!s.tabs.includes(path)) return s
      const tabs = s.tabs.filter((t) => t === path || s.pinnedTabs.includes(t))
      return { tabs, active: path, previewPath: null }
    }),
  closeToRight: (path) =>
    set((s) => {
      const i = s.tabs.indexOf(path)
      if (i < 0) return s
      const tabs = s.tabs.filter((t, at) => at <= i || s.pinnedTabs.includes(t))
      const active = s.active && tabs.includes(s.active) ? s.active : path
      return { tabs, active, previewPath: null }
    }),
  closeAll: () =>
    set((s) => {
      const tabs = s.tabs.filter((t) => s.pinnedTabs.includes(t))
      return { tabs, active: tabs[tabs.length - 1] ?? null, previewPath: null }
    }),
  moveTab: (path, beforePath) =>
    set((s) => {
      if (path === beforePath) return s
      const without = s.tabs.filter((t) => t !== path)
      if (without.length === s.tabs.length) return s // path not open
      const at = beforePath === null ? without.length : without.indexOf(beforePath)
      const idx = at < 0 ? without.length : at
      return { tabs: [...without.slice(0, idx), path, ...without.slice(idx)] }
    }),
  renamePath: (from, to) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t === from ? to : t)),
      active: s.active === from ? to : s.active,
    })),
  setActive: (path) => set({ active: path }),
  // Mirror to settings so the preference survives a reopen (init re-seeds from it).
  setShowHidden: (show) => {
    useSettings.getState().set({ showHidden: show })
    set({ showHidden: show })
  },
}))

/**
 * Zen mode: one switch that puts everything but the editor away, and gives it
 * all back on the way out.
 *
 * The chrome it hides is chrome you may have set deliberately, so entering
 * records the current state and leaving replays it — otherwise a reader who runs
 * without a status bar would find one waiting for them every time they left zen.
 */
export function toggleZenMode(on?: boolean) {
  const settings = useSettings.getState()
  const next = on ?? !settings.zenMode
  if (next === settings.zenMode) return
  if (next) {
    settings.set({
      zenMode: true,
      zenRestore: {
        showActivityBar: settings.showActivityBar,
        showStatusBar: settings.showStatusBar,
        showBreadcrumbs: settings.showBreadcrumbs,
        centeredLayout: settings.centeredLayout,
        tool: useWorkspace.getState().tool,
      },
      showActivityBar: false,
      showStatusBar: false,
      showBreadcrumbs: false,
      centeredLayout: true,
    })
    useWorkspace.setState({ tool: null })
    return
  }
  const back = settings.zenRestore
  settings.set({
    zenMode: false,
    zenRestore: null,
    // No record (zen was persisted from an older build, say) → leave the chrome
    // as it is rather than inventing a state the reader never chose.
    ...(back
      ? {
          showActivityBar: back.showActivityBar,
          showStatusBar: back.showStatusBar,
          showBreadcrumbs: back.showBreadcrumbs,
          centeredLayout: back.centeredLayout,
        }
      : {}),
  })
  if (back) useWorkspace.setState({ tool: back.tool as Tool | null })
}
