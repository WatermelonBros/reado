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
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GitInfo } from "./api";

export type ThemeName =
  | "reado-dark"
  | "reado-light"
  | "reado-high-contrast"
  | "reado-sepia";

export type ThemeMode = "manual" | "system" | "auto";

export const THEMES: ThemeName[] = [
  "reado-dark",
  "reado-light",
  "reado-high-contrast",
  "reado-sepia",
];

/** Legible bounds for the editor's numeric reading controls. */
export const FONT_SIZE_RANGE = { min: 10, max: 24, default: 13 } as const;
export const LINE_HEIGHT_RANGE = { min: 1.2, max: 2.2, default: 1.65 } as const;

/** Clamp `n` into a range; a non-finite value falls back to the range default,
 *  so a corrupted persisted value can never reach the editor. */
export const clampRange = (
  n: number,
  r: { min: number; max: number; default: number },
): number => (Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, n)) : r.default);

export interface SettingsState {
  /** Theme used when mode is "manual". */
  theme: ThemeName;
  /** Light theme used by "system"/"auto" modes. */
  lightTheme: ThemeName;
  /** Dark theme used by "system"/"auto" modes. */
  darkTheme: ThemeName;
  mode: ThemeMode;
  codeFont: string;
  /** Editor text size in px (clamped to FONT_SIZE_RANGE on read). */
  fontSize: number;
  /** Editor line height as a unitless multiplier (clamped to LINE_HEIGHT_RANGE). */
  lineHeight: number;
  /** Gutter line numbers: hidden, absolute, or relative to the caret. */
  lineNumbers: "off" | "on" | "relative";
  /** Active-line emphasis: none, gutter only, line background only, or both. */
  activeLine: "off" | "gutter" | "line" | "both";
  /** Indentation guides: off, on all indentation, or only the active scope. */
  indentGuides: "off" | "all" | "active";
  /** Highlight the bracket matching the one at the caret. */
  bracketMatching: boolean;
  /** Vertical guide at this column as a target max line length (0 = off). */
  rulerColumn: number;
  /** Damp non-essential UI motion: follow the OS, force on, or force off. */
  reduceMotion: "system" | "on" | "off";
  /** Editor tab strip: full row, single tab, or hidden. */
  tabBar: "multiple" | "single" | "hidden";
  /** Editor scrollbar visibility. */
  scrollbar: "auto" | "always" | "hidden";
  /** Caret shape. */
  cursorStyle: "line" | "block" | "underline";
  /** Caret blink behaviour. */
  cursorBlink: "blink" | "smooth" | "solid";
  /** Keep resolved comment threads visible, or hide them to declutter. */
  showResolvedComments: boolean;
  /** Draw diagnostic squiggles inline (the Problems panel is unaffected). */
  inlineDiagnostics: boolean;
  /** Glob patterns hidden from the file tree and project search. */
  excludeGlobs: string[];
  /** Restore a project's tabs/scroll/caret on reopen, or start clean. */
  restoreSession: boolean;
  /** Trim trailing whitespace on save (never on read). */
  trimTrailingWhitespace: boolean;
  /** Ensure a single final newline on save (never on read). */
  insertFinalNewline: boolean;
  /** Soft-focus the rest of the file around the cursor. */
  focusMode: boolean;
  /** Wrap long lines instead of scrolling horizontally. */
  wrap: boolean;
  /** Pin the enclosing scope headers while scrolling. */
  stickyScroll: boolean;
  /** Interface zoom factor (1 = 100%). */
  zoom: number;
  /** Version `.reado/` (except the rebuildable index) instead of gitignoring it. */
  versionReado: boolean;
  /** Suppress the first-comment gitignore prompt once the user opts out. */
  gitignoreDontAsk: boolean;
  /** Play a soft chime when the agent finishes resolving tasks. */
  completionSound: boolean;
  /** Automatically write edits to disk: never / after a short pause / on blur. */
  autoSave: "off" | "afterDelay" | "onFocusChange";
  /** Chrome visibility toggles (View menu). */
  showActivityBar: boolean;
  showStatusBar: boolean;
  showBreadcrumbs: boolean;
  /** Show spaces/tabs as faint marks in the editor. */
  renderWhitespace: boolean;
  /** Show the structure ribbon (symbols/comments/diagnostics overview column). */
  showRibbon: boolean;
  /** File-tree icon style: generic glyph, per-type mono glyph, or tinted per type. */
  fileIcons: "off" | "mono" | "colored";
  /** Write a diagnostic log file you can send back to us (on by default). */
  logEnabled: boolean;
  /** How much detail the log captures. */
  logLevel: "error" | "warn" | "info" | "debug" | "trace";
  /** Show hidden & git-ignored files in the tree (remembered across sessions). */
  showHidden: boolean;
  /** Last-used guided-review objective, so it isn't re-picked every time. */
  reviewObjective: string;
  /** The user dismissed the "make Reado the default app for text files" prompt. */
  defaultAppsDismissed: boolean;
  set: (patch: Partial<SettingsState>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "reado-dark",
      lightTheme: "reado-light",
      darkTheme: "reado-dark",
      mode: "system",
      codeFont: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: LINE_HEIGHT_RANGE.default,
      lineNumbers: "on",
      activeLine: "both",
      indentGuides: "all",
      bracketMatching: true,
      rulerColumn: 120,
      reduceMotion: "system",
      tabBar: "multiple",
      scrollbar: "auto",
      cursorStyle: "line",
      cursorBlink: "smooth",
      showResolvedComments: true,
      inlineDiagnostics: true,
      excludeGlobs: [],
      restoreSession: true,
      trimTrailingWhitespace: false,
      insertFinalNewline: false,
      focusMode: false,
      wrap: true,
      stickyScroll: true,
      zoom: 1,
      versionReado: false,
      gitignoreDontAsk: false,
      completionSound: false,
      autoSave: "afterDelay",
      showActivityBar: true,
      showStatusBar: true,
      showBreadcrumbs: true,
      renderWhitespace: false,
      showRibbon: true,
      fileIcons: "colored",
      logEnabled: true,
      logLevel: "info",
      showHidden: false,
      reviewObjective: "bug_risk",
      defaultAppsDismissed: false,
      set: (patch) => set(patch),
    }),
    {
      name: "reado.settings",
      version: 2,
      migrate: (state, version) => {
        const s = state as Partial<SettingsState>;
        // v0 stored fileIcons as "plain" | "colored"; "plain" → per-type mono.
        if (version < 1 && (s.fileIcons as string) === "plain") s.fileIcons = "mono";
        // v2 added the editor reading controls; normalise the numeric ones so a
        // stale/corrupted persisted value can't reach the editor.
        if (version < 2) {
          s.fontSize = clampRange(Number(s.fontSize), FONT_SIZE_RANGE);
          s.lineHeight = clampRange(Number(s.lineHeight), LINE_HEIGHT_RANGE);
        }
        return s as SettingsState;
      },
    },
  ),
);

export interface RecentProject {
  path: string;
  name: string;
  /** Epoch millis of last open, for ordering. */
  openedAt: number;
}

interface RecentsState {
  projects: RecentProject[];
  touch: (path: string) => void;
  remove: (path: string) => void;
}

const basename = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;

export const useRecents = create<RecentsState>()(
  persist(
    (set) => ({
      projects: [],
      touch: (path) =>
        set((s) => {
          const rest = s.projects.filter((p) => p.path !== path);
          return {
            projects: [
              { path, name: basename(path), openedAt: Date.now() },
              ...rest,
            ].slice(0, 30),
          };
        }),
      remove: (path) =>
        set((s) => ({ projects: s.projects.filter((p) => p.path !== path) })),
    }),
    { name: "reado.recents" },
  ),
);

export interface Session {
  /** Open file paths, in tab order. */
  tabs: string[];
  /** Active file path, or null. */
  active: string | null;
  /** Per-file editor scroll offset (px), so reopening returns to where you were. */
  scroll?: Record<string, number>;
  /** Per-file cursor position, so reopening restores the caret (not just scroll). */
  cursor?: Record<string, { line: number; col: number }>;
  /** Expanded directory paths in the tree, so the drill-down survives a reopen. */
  expanded?: string[];
  /** The file shown in the split pane, so a side-by-side comparison survives. */
  split?: string | null;
}

interface SessionsState {
  byRoot: Record<string, Session>;
  save: (root: string, session: Session) => void;
  /** Remember the editor scroll offset for a file (merged into its session). */
  saveScroll: (root: string, path: string, top: number) => void;
  /** Remember the cursor position for a file. */
  saveCursor: (root: string, path: string, line: number, col: number) => void;
}

export const useSessions = create<SessionsState>()(
  persist(
    (set) => ({
      byRoot: {},
      // Preserve the per-file maps (scroll/cursor) and drill-down state when
      // tabs/active change, so a plain tab save never wipes them.
      save: (root, session) =>
        set((s) => {
          const prev = s.byRoot[root];
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
          };
        }),
      saveScroll: (root, path, top) =>
        set((s) => {
          const prev = s.byRoot[root] ?? { tabs: [], active: null };
          return {
            byRoot: {
              ...s.byRoot,
              [root]: { ...prev, scroll: { ...prev.scroll, [path]: top } },
            },
          };
        }),
      saveCursor: (root, path, line, col) =>
        set((s) => {
          const prev = s.byRoot[root] ?? { tabs: [], active: null };
          return {
            byRoot: {
              ...s.byRoot,
              [root]: { ...prev, cursor: { ...prev.cursor, [path]: { line, col } } },
            },
          };
        }),
    }),
    { name: "reado.sessions" },
  ),
);

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
  | "extensions";

interface WorkspaceState {
  /** Active side-panel tool, or null when the panel is collapsed. */
  tool: Tool | null;
  /** The tool to restore when re-opening a collapsed sidebar. */
  lastTool: Tool;
  /** Select a tool; selecting the active one collapses the panel. */
  selectTool: (tool: Tool) => void;
  /** Collapse the sidebar, or restore the last tool (Ctrl+B). */
  toggleSidebar: () => void;
  /** A query to seed the search panel (find references), consumed on read. */
  pendingSearch: string | null;
  searchFor: (query: string) => void;
  clearPendingSearch: () => void;
  /** Whether the knowledge-graph overlay is open. */
  graphOpen: boolean;
  toggleGraph: (open?: boolean) => void;
  /** Whether the documentation overlay is open. */
  docsOpen: boolean;
  toggleDocs: (open?: boolean) => void;
  /** Side-panel width in px (drag-resizable), persisted. */
  sidebarWidth: number;
  setSidebarWidth: (px: number) => void;
  /** Comments-panel filters, remembered so a tool-switch doesn't reset them. */
  commentFilter: { view: "open" | "history"; type: string; state: string; thisFile: boolean };
  setCommentFilter: (patch: Partial<WorkspaceState["commentFilter"]>) => void;
  /** Last search-panel query, so leaving and returning doesn't lose it. */
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** User's custom activity-bar order (tool ids). Tools not listed keep their
   *  natural order after the listed ones. Empty = default order. */
  toolOrder: Tool[];
  setToolOrder: (order: Tool[]) => void;
}

/** Tool sidebar state (which side panel is shown), persisted per user. */
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      tool: "files",
      lastTool: "files",
      selectTool: (tool) =>
        set((s) => (s.tool === tool ? { tool: null } : { tool, lastTool: tool })),
      toggleSidebar: () =>
        set((s) => (s.tool ? { tool: null } : { tool: s.lastTool })),
      pendingSearch: null,
      searchFor: (query) =>
        set({ tool: "search", lastTool: "search", pendingSearch: query }),
      clearPendingSearch: () => set({ pendingSearch: null }),
      graphOpen: false,
      toggleGraph: (open) => set((s) => ({ graphOpen: open ?? !s.graphOpen })),
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
      setSearchQuery: (q) => set({ searchQuery: q }),
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
);

export type PaletteMode =
  | "commands"
  | "files"
  | "search"
  | "symbols"
  | "wsymbols"
  | "recents"
  | "bookmarks"
  | null;

interface PaletteState {
  mode: PaletteMode;
  /** True while the settings panel is shown. */
  settingsOpen: boolean;
  /** True while the keyboard-shortcuts reference is shown. */
  shortcutsOpen: boolean;
  /** True while the Reado Anywhere (phone pairing) dialog is shown. */
  anywhereOpen: boolean;
  open: (mode: Exclude<PaletteMode, null>) => void;
  close: () => void;
  toggleSettings: (open?: boolean) => void;
  toggleShortcuts: (open?: boolean) => void;
  toggleAnywhere: (open?: boolean) => void;
}

/** Drives the quick-open palette (commands / files / search) and settings. */
export const usePalette = create<PaletteState>((set) => ({
  mode: null,
  settingsOpen: false,
  shortcutsOpen: false,
  anywhereOpen: false,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
  toggleSettings: (open) =>
    set((s) => ({ settingsOpen: open ?? !s.settingsOpen, mode: null })),
  toggleShortcuts: (open) =>
    set((s) => ({ shortcutsOpen: open ?? !s.shortcutsOpen, mode: null })),
  toggleAnywhere: (open) =>
    set((s) => ({ anywhereOpen: open ?? !s.anywhereOpen, mode: null })),
}));

interface EditorActionsState {
  /** Bumped to request the active code view to open the comment composer. */
  composeNonce: number;
  requestCompose: () => void;
  /** Bumped to ask the active view to explain the current selection with AI. */
  explainNonce: number;
  requestExplain: () => void;
  /** Bumped to ask the active view to peek the definition at the cursor. */
  peekNonce: number;
  requestPeek: () => void;
  /** Manual editing enabled for the active file (read-first stays the default). */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** True when the active editable file has unsaved changes. */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** Show the active file as a diff against its committed version. */
  diffing: boolean;
  setDiffing: (diffing: boolean) => void;
  /** The git ref the diff compares against (HEAD, a branch, or a commit hash). */
  diffBase: string;
  setDiffBase: (base: string) => void;
  /** Show a per-line git blame gutter in the editor. */
  blame: boolean;
  setBlame: (blame: boolean) => void;
}

/** Bridge for triggering editor actions from outside the editor (e.g. global
 *  shortcuts or the command palette), without coupling to the editor's focus.
 *  `blame` and `diffBase` are persisted so a preferred view survives a restart;
 *  the transient nonces / dirty / diffing / editing flags are not. */
export const useEditorActions = create<EditorActionsState>()(
  persist(
    (set) => ({
      composeNonce: 0,
      requestCompose: () => set((s) => ({ composeNonce: s.composeNonce + 1 })),
      explainNonce: 0,
      requestExplain: () => set((s) => ({ explainNonce: s.explainNonce + 1 })),
      peekNonce: 0,
      requestPeek: () => set((s) => ({ peekNonce: s.peekNonce + 1 })),
      editing: false,
      setEditing: (editing) => set({ editing }),
      dirty: false,
      setDirty: (dirty) => set({ dirty }),
      diffing: false,
      setDiffing: (diffing) => set({ diffing }),
      diffBase: "HEAD",
      setDiffBase: (base) => set({ diffBase: base }),
      blame: false,
      setBlame: (blame) => set({ blame }),
    }),
    {
      name: "reado.editor",
      partialize: (s) => ({ blame: s.blame, diffBase: s.diffBase }),
    },
  ),
);

interface CursorState {
  line: number;
  col: number;
  set: (line: number, col: number) => void;
}

/** Cursor position of the focused editor, shown in the status bar. Kept in its
 *  own store so frequent cursor moves don't re-render the whole project tree. */
export const useCursor = create<CursorState>((set) => ({
  line: 1,
  col: 1,
  set: (line, col) => set({ line, col }),
}));

/** A single thing to jump to after navigation, for the landing highlight. */
export interface Landing {
  path: string;
  line: number;
  /** Bumped on every jump so repeated jumps to the same line re-trigger. */
  nonce: number;
}

interface ProjectState {
  root: string;
  git: GitInfo;
  tabs: string[];
  active: string | null;
  showHidden: boolean;
  landing: Landing | null;
  /** Bumped to make the file tree re-list directories (external/internal changes). */
  treeNonce: number;
  bumpTree: () => void;
  /** Bumped to collapse every expanded folder in the tree. */
  collapseNonce: number;
  collapseTree: () => void;
  /** Expanded directory paths in the tree (persisted per project via Session). */
  expandedDirs: string[];
  /** Toggle a directory's expansion (and remember it). */
  toggleDir: (path: string, open?: boolean) => void;
  /** Back/forward history of visited locations, and the cursor into it. */
  navStack: { path: string; line?: number }[];
  navIndex: number;
  goBack: () => void;
  goForward: () => void;
  /** Recently closed tabs (newest last), for reopen. */
  closedTabs: string[];
  reopenClosed: () => void;
  /** Cycle the active tab in order (Ctrl+Tab / Ctrl+Shift+Tab). */
  cycleTab: (dir: 1 | -1) => void;
  /** A second file shown side-by-side, or null when not split. */
  splitPath: string | null;
  /** Open the split pane (defaults to the current file), or set its file. */
  openSplit: (path?: string) => void;
  closeSplit: () => void;
  /** Swap which file is primary (left) and which is in the split (right). */
  swapSplit: () => void;
  init: (root: string, git: GitInfo, session?: Session) => void;
  setGit: (git: GitInfo) => void;
  open: (path: string, line?: number) => void;
  close: (path: string) => void;
  /** Repoint an open tab after its file moved on disk. */
  renamePath: (from: string, to: string) => void;
  /** Close every tab except `path` (becomes active). */
  closeOthers: (path: string) => void;
  /** Close the tabs to the right of `path`. */
  closeToRight: (path: string) => void;
  /** Close all tabs. */
  closeAll: () => void;
  /** Reorder an open tab: move `path` to just before `beforePath` (or to the end
   *  when `beforePath` is null). Drag-and-drop in the tab strip. */
  moveTab: (path: string, beforePath: string | null) => void;
  setActive: (path: string) => void;
  setShowHidden: (show: boolean) => void;
}

export const useProject = create<ProjectState>((set) => ({
  root: "",
  git: { isRepo: false, branch: null, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false },
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
      const has = s.expandedDirs.includes(path);
      const want = open ?? !has;
      if (want === has) return s;
      return {
        expandedDirs: want
          ? [...s.expandedDirs, path]
          : s.expandedDirs.filter((p) => p !== path),
      };
    }),
  navStack: [],
  navIndex: -1,
  closedTabs: [],
  goBack: () =>
    set((s) => {
      if (s.navIndex <= 0) return s;
      const navIndex = s.navIndex - 1;
      const e = s.navStack[navIndex];
      return {
        navIndex,
        tabs: s.tabs.includes(e.path) ? s.tabs : [...s.tabs, e.path],
        active: e.path,
        landing:
          e.line !== undefined
            ? { path: e.path, line: e.line, nonce: (s.landing?.nonce ?? 0) + 1 }
            : s.landing,
      };
    }),
  goForward: () =>
    set((s) => {
      if (s.navIndex >= s.navStack.length - 1) return s;
      const navIndex = s.navIndex + 1;
      const e = s.navStack[navIndex];
      return {
        navIndex,
        tabs: s.tabs.includes(e.path) ? s.tabs : [...s.tabs, e.path],
        active: e.path,
        landing:
          e.line !== undefined
            ? { path: e.path, line: e.line, nonce: (s.landing?.nonce ?? 0) + 1 }
            : s.landing,
      };
    }),
  reopenClosed: () =>
    set((s) => {
      if (s.closedTabs.length === 0) return s;
      const closedTabs = s.closedTabs.slice(0, -1);
      const path = s.closedTabs[s.closedTabs.length - 1];
      return {
        closedTabs,
        tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path],
        active: path,
      };
    }),
  cycleTab: (dir) =>
    set((s) => {
      if (s.tabs.length < 2) return s;
      const i = s.active ? s.tabs.indexOf(s.active) : 0;
      const next = (i + dir + s.tabs.length) % s.tabs.length;
      return { active: s.tabs[next] };
    }),
  splitPath: null,
  openSplit: (path) => set((s) => ({ splitPath: path ?? s.active })),
  closeSplit: () => set({ splitPath: null }),
  swapSplit: () =>
    set((s) => (s.splitPath ? { active: s.splitPath, splitPath: s.active } : s)),
  init: (root, git, session) =>
    set({
      root,
      git,
      tabs: session?.tabs ?? [],
      active: session?.active ?? null,
      // Restore the per-project drill-down, split, and hidden-files preference so
      // reopening a repo lands where you left it rather than fully collapsed.
      expandedDirs: session?.expanded ?? [],
      splitPath: session?.split ?? null,
      showHidden: useSettings.getState().showHidden,
      navStack: session?.active ? [{ path: session.active }] : [],
      navIndex: session?.active ? 0 : -1,
      closedTabs: [],
    }),
  setGit: (git) => set({ git }),
  open: (path, line) =>
    set((s) => {
      const tabs = s.tabs.includes(path) ? s.tabs : [...s.tabs, path];
      // Record into history: truncate any forward entries, collapse a repeat of
      // the current path (just update its line), and cap the depth.
      const cur = s.navStack[s.navIndex];
      let navStack = s.navStack;
      let navIndex = s.navIndex;
      if (!cur || cur.path !== path) {
        navStack = [...s.navStack.slice(0, s.navIndex + 1), { path, line }].slice(-50);
        navIndex = navStack.length - 1;
      } else if (line !== undefined) {
        navStack = [...s.navStack];
        navStack[s.navIndex] = { path, line };
      }
      return {
        tabs,
        active: path,
        landing:
          line !== undefined
            ? { path, line, nonce: (s.landing?.nonce ?? 0) + 1 }
            : s.landing,
        navStack,
        navIndex,
      };
    }),
  close: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== path);
      const active =
        s.active === path ? (tabs[tabs.length - 1] ?? null) : s.active;
      return { tabs, active, closedTabs: [...s.closedTabs, path].slice(-25) };
    }),
  closeOthers: (path) =>
    set((s) => (s.tabs.includes(path) ? { tabs: [path], active: path } : s)),
  closeToRight: (path) =>
    set((s) => {
      const i = s.tabs.indexOf(path);
      if (i < 0) return s;
      const tabs = s.tabs.slice(0, i + 1);
      const active = s.active && tabs.includes(s.active) ? s.active : path;
      return { tabs, active };
    }),
  closeAll: () => set({ tabs: [], active: null }),
  moveTab: (path, beforePath) =>
    set((s) => {
      if (path === beforePath) return s;
      const without = s.tabs.filter((t) => t !== path);
      if (without.length === s.tabs.length) return s; // path not open
      const at = beforePath === null ? without.length : without.indexOf(beforePath);
      const idx = at < 0 ? without.length : at;
      return { tabs: [...without.slice(0, idx), path, ...without.slice(idx)] };
    }),
  renamePath: (from, to) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t === from ? to : t)),
      active: s.active === from ? to : s.active,
    })),
  setActive: (path) => set({ active: path }),
  // Mirror to settings so the preference survives a reopen (init re-seeds from it).
  setShowHidden: (show) => {
    useSettings.getState().set({ showHidden: show });
    set({ showHidden: show });
  },
}));
