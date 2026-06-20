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

export interface SettingsState {
  /** Theme used when mode is "manual". */
  theme: ThemeName;
  /** Light theme used by "system"/"auto" modes. */
  lightTheme: ThemeName;
  /** Dark theme used by "system"/"auto" modes. */
  darkTheme: ThemeName;
  mode: ThemeMode;
  codeFont: string;
  /** Constrain code to a comfortable reading measure. */
  readingWidth: boolean;
  /** Soft-focus the rest of the file around the cursor. */
  focusMode: boolean;
  /** Wrap long lines instead of scrolling horizontally. */
  wrap: boolean;
  /** Interface zoom factor (1 = 100%). */
  zoom: number;
  /** Version `.reado/` (except the rebuildable index) instead of gitignoring it. */
  versionReado: boolean;
  /** Suppress the first-comment gitignore prompt once the user opts out. */
  gitignoreDontAsk: boolean;
  /** Play a soft chime when the agent finishes resolving tasks. */
  completionSound: boolean;
  set: (patch: Partial<SettingsState>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "reado-dark",
      lightTheme: "reado-light",
      darkTheme: "reado-dark",
      mode: "system",
      codeFont: "",
      readingWidth: false,
      focusMode: false,
      wrap: false,
      zoom: 1,
      versionReado: false,
      gitignoreDontAsk: false,
      completionSound: false,
      set: (patch) => set(patch),
    }),
    { name: "reado.settings" },
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
}

interface SessionsState {
  byRoot: Record<string, Session>;
  save: (root: string, session: Session) => void;
  /** Remember the editor scroll offset for a file (merged into its session). */
  saveScroll: (root: string, path: string, top: number) => void;
}

export const useSessions = create<SessionsState>()(
  persist(
    (set) => ({
      byRoot: {},
      // Preserve the existing scroll map when tabs/active change.
      save: (root, session) =>
        set((s) => ({
          byRoot: {
            ...s.byRoot,
            [root]: { ...session, scroll: session.scroll ?? s.byRoot[root]?.scroll },
          },
        })),
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
    }),
    { name: "reado.sessions" },
  ),
);

export type Tool = "files" | "search" | "comments" | "git" | "orphans" | "specs";

interface WorkspaceState {
  /** Active side-panel tool, or null when the panel is collapsed. */
  tool: Tool | null;
  /** Select a tool; selecting the active one collapses the panel. */
  selectTool: (tool: Tool) => void;
  /** Whether the knowledge-graph overlay is open. */
  graphOpen: boolean;
  toggleGraph: (open?: boolean) => void;
  /** Whether the documentation overlay is open. */
  docsOpen: boolean;
  toggleDocs: (open?: boolean) => void;
}

/** Tool sidebar state (which side panel is shown), persisted per user. */
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      tool: "files",
      selectTool: (tool) => set((s) => ({ tool: s.tool === tool ? null : tool })),
      graphOpen: false,
      toggleGraph: (open) => set((s) => ({ graphOpen: open ?? !s.graphOpen })),
      docsOpen: false,
      toggleDocs: (open) => set((s) => ({ docsOpen: open ?? !s.docsOpen })),
    }),
    { name: "reado.workspace", partialize: (s) => ({ tool: s.tool }) },
  ),
);

export type PaletteMode = "commands" | "files" | "search" | "symbols" | null;

interface PaletteState {
  mode: PaletteMode;
  /** True while the settings panel is shown. */
  settingsOpen: boolean;
  open: (mode: Exclude<PaletteMode, null>) => void;
  close: () => void;
  toggleSettings: (open?: boolean) => void;
}

/** Drives the quick-open palette (commands / files / search) and settings. */
export const usePalette = create<PaletteState>((set) => ({
  mode: null,
  settingsOpen: false,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
  toggleSettings: (open) =>
    set((s) => ({ settingsOpen: open ?? !s.settingsOpen, mode: null })),
}));

interface EditorActionsState {
  /** Bumped to request the active code view to open the comment composer. */
  composeNonce: number;
  requestCompose: () => void;
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
 *  shortcuts or the command palette), without coupling to the editor's focus. */
export const useEditorActions = create<EditorActionsState>((set) => ({
  composeNonce: 0,
  requestCompose: () => set((s) => ({ composeNonce: s.composeNonce + 1 })),
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
}));

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
  init: (root: string, git: GitInfo, session?: Session) => void;
  setGit: (git: GitInfo) => void;
  open: (path: string, line?: number) => void;
  close: (path: string) => void;
  /** Close every tab except `path` (becomes active). */
  closeOthers: (path: string) => void;
  /** Close the tabs to the right of `path`. */
  closeToRight: (path: string) => void;
  /** Close all tabs. */
  closeAll: () => void;
  setActive: (path: string) => void;
  setShowHidden: (show: boolean) => void;
}

export const useProject = create<ProjectState>((set) => ({
  root: "",
  git: { isRepo: false, branch: null },
  tabs: [],
  active: null,
  showHidden: false,
  landing: null,
  init: (root, git, session) =>
    set({
      root,
      git,
      tabs: session?.tabs ?? [],
      active: session?.active ?? null,
    }),
  setGit: (git) => set({ git }),
  open: (path, line) =>
    set((s) => ({
      tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path],
      active: path,
      landing:
        line !== undefined
          ? { path, line, nonce: (s.landing?.nonce ?? 0) + 1 }
          : s.landing,
    })),
  close: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== path);
      const active =
        s.active === path ? (tabs[tabs.length - 1] ?? null) : s.active;
      return { tabs, active };
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
  setActive: (path) => set({ active: path }),
  setShowHidden: (show) => set({ showHidden: show }),
}));
