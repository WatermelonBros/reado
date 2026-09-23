import { create } from "zustand"
import type { GitInfo } from "@/lib/api"
import type { Session } from "./sessions"
import { useSettings } from "./settings"

/** One editor group: its own tabs, its own active file, its own history. */
export interface EditorGroup {
  id: string
  tabs: string[]
  active: string | null
  navStack: { path: string; line?: number }[]
  navIndex: number
}

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
