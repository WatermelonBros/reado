import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ExtListing } from "@/lib/api"
import { findPanel, useLayout } from "@/lib/layout"
import { useSettings } from "./settings"

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
  /** Show a tool, never hide it — what "Open View ▸ X" and its shortcut mean. */
  openTool: (tool: Tool) => void
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
/**
 * A tool the user has docked lives there now: bring it forward in its dock group
 * instead of a second copy appearing in the sidebar. Unhide the region first — a
 * docked tool whose region is collapsed would otherwise make the activity-bar
 * button look dead. Its neighbours keep running: a dock group shows one tab and
 * closes none of them. Returns whether the tool was docked (and so handled).
 */
function bringDockedForward(tool: Tool): boolean {
  const at = findPanel(useLayout.getState().layout, tool)
  if (!at) return false
  useLayout.getState().toggleArea(at.area, false)
  useLayout.getState().activate(tool)
  return true
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      tool: "files",
      lastTool: "files",
      selectTool: (tool) => {
        if (bringDockedForward(tool)) return
        set((s) => (s.tool === tool ? { tool: null } : { tool, lastTool: tool }))
      },
      // "Open View ▸ Files" and ⌘⇧E used to route through `selectTool`, so
      // pressing them while that view was already showing collapsed the sidebar
      // — a menu item called *Open* that closed, and the VS Code shortcuts doing
      // the opposite of what they do there. Opening is now its own verb;
      // toggling stays where it was asked for (the activity-bar button, ⌘B).
      openTool: (tool) => {
        if (bringDockedForward(tool)) return
        set({ tool, lastTool: tool })
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
