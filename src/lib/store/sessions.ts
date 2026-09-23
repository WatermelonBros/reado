import { create } from "zustand"
import { persist } from "zustand/middleware"
import { baseName } from "@/lib/comments"
import type { EditorGroup } from "./project"

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
