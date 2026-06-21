/**
 * Integrated-terminal state.
 *
 * Two layers:
 *   - `sessions` — the flat list of panes, each backed by a live PTY in Rust.
 *     `activeId` is the *focused* pane (where input / agent launches go). Kept
 *     flat so the launch buttons, dialogs and git actions stay simple.
 *   - `groups` — the layout over those panes. A group is a tab; it tiles its
 *     panes along one axis (`dir`) with `sizes` weights. `activeGroupId` is the
 *     visible tab.
 *
 * PTYs outlive tab switches and layout changes: each pane's `<Terminal>` stays
 * mounted (hidden when not in the active group) so scrollback persists.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TermSession {
  id: string;
  title: string;
}

export interface TermGroup {
  id: string;
  /** Tiling axis: "row" = side-by-side, "column" = stacked. */
  dir: "row" | "column";
  /** Panes in this group, in display order. */
  paneIds: string[];
  /** Flex weights parallel to `paneIds` (sum ≈ 1). */
  sizes: number[];
}

let counter = 0;
const newId = () => `t_${Date.now().toString(36)}_${counter++}`;
const newGroupId = () => `g_${Date.now().toString(36)}_${counter++}`;

/** Evenly weighted sizes for `n` panes. */
const even = (n: number): number[] => Array(n).fill(1 / n);

interface TerminalsState {
  sessions: TermSession[];
  /** The focused pane — input, launches and review/audit injection target it. */
  activeId: string | null;
  groups: TermGroup[];
  activeGroupId: string | null;
  /** Whether the bottom terminal panel is visible. */
  open: boolean;
  /** Panel height in px when docked at the bottom (drag-resizable). */
  height: number;
  setHeight: (px: number) => void;
  /** Panel width in px when docked on the right (drag-resizable). */
  width: number;
  setWidth: (px: number) => void;
  /** Where the panel docks. */
  position: "bottom" | "right";
  togglePosition: () => void;
  /** Create a new tab (group with one pane) and focus it. Returns the pane id. */
  add: () => string;
  /** Add a pane to the active group (split), focus it. Returns the pane id. */
  split: () => string;
  /** Remove a pane; removes its group when it was the last one. */
  remove: (id: string) => void;
  /** Remove a whole group (tab) and all its panes. */
  removeGroup: (groupId: string) => void;
  /** Focus a pane (and select its group). */
  setActive: (id: string) => void;
  /** Select a group (tab) and focus its first pane. */
  setActiveGroup: (groupId: string) => void;
  /** Toggle/set a group's tiling axis. */
  setGroupDir: (groupId: string, dir?: "row" | "column") => void;
  /** Set a group's pane size weights. */
  setSizes: (groupId: string, sizes: number[]) => void;
  setTitle: (id: string, title: string) => void;
  /** Toggle (or set) the panel; opening with no tabs creates the first one. */
  toggle: (open?: boolean) => void;
}

export const useTerminals = create<TerminalsState>()(
  persist(
    (set, get) => ({
  sessions: [],
  activeId: null,
  groups: [],
  activeGroupId: null,
  open: false,
  height: 280,
  // Clamp so the panel can't swallow the whole window or vanish.
  setHeight: (px) => set({ height: Math.max(120, Math.min(px, window.innerHeight - 160)) }),
  width: 480,
  setWidth: (px) => set({ width: Math.max(240, Math.min(px, window.innerWidth - 360)) }),
  position: "bottom",
  togglePosition: () =>
    set((s) => ({ position: s.position === "bottom" ? "right" : "bottom" })),

  add: () => {
    const id = newId();
    const gid = newGroupId();
    set((s) => ({
      sessions: [...s.sessions, { id, title: `Terminal ${s.sessions.length + 1}` }],
      groups: [...s.groups, { id: gid, dir: "row", paneIds: [id], sizes: [1] }],
      activeId: id,
      activeGroupId: gid,
      open: true,
    }));
    return id;
  },

  split: () => {
    const gid = get().activeGroupId;
    if (!gid) return get().add();
    const id = newId();
    set((s) => ({
      sessions: [...s.sessions, { id, title: `Terminal ${s.sessions.length + 1}` }],
      groups: s.groups.map((g) =>
        g.id === gid
          ? { ...g, paneIds: [...g.paneIds, id], sizes: even(g.paneIds.length + 1) }
          : g,
      ),
      activeId: id,
      open: true,
    }));
    return id;
  },

  remove: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((t) => t.id !== id);
      const groups = s.groups
        .map((g) => {
          if (!g.paneIds.includes(id)) return g;
          const paneIds = g.paneIds.filter((p) => p !== id);
          return { ...g, paneIds, sizes: even(paneIds.length) };
        })
        .filter((g) => g.paneIds.length > 0);
      return { sessions, groups, ...resolveActive(s, groups, id) };
    }),

  removeGroup: (groupId) =>
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      if (!group) return s;
      const gone = new Set(group.paneIds);
      const sessions = s.sessions.filter((t) => !gone.has(t.id));
      const groups = s.groups.filter((g) => g.id !== groupId);
      return { sessions, groups, ...resolveActive(s, groups, s.activeId ?? "") };
    }),

  setActive: (id) =>
    set((s) => ({
      activeId: id,
      activeGroupId: s.groups.find((g) => g.paneIds.includes(id))?.id ?? s.activeGroupId,
    })),

  setActiveGroup: (groupId) =>
    set((s) => ({
      activeGroupId: groupId,
      activeId: s.groups.find((g) => g.id === groupId)?.paneIds[0] ?? s.activeId,
    })),

  setGroupDir: (groupId, dir) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, dir: dir ?? (g.dir === "row" ? "column" : "row") }
          : g,
      ),
    })),

  setSizes: (groupId, sizes) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, sizes } : g)),
    })),

  setTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  toggle: (open) =>
    set((s) => {
      const next = open ?? !s.open;
      if (next && s.groups.length === 0) {
        const id = newId();
        const gid = newGroupId();
        return {
          open: true,
          sessions: [{ id, title: "Terminal 1" }],
          groups: [{ id: gid, dir: "row", paneIds: [id], sizes: [1] }],
          activeId: id,
          activeGroupId: gid,
        };
      }
      return { open: next };
    }),
    }),
    {
      // Persist only the layout preferences — sessions/groups reference live PTYs
      // that don't survive a restart.
      name: "reado.terminal-layout",
      partialize: (s) => ({ position: s.position, height: s.height, width: s.width }),
    },
  ),
);

/** After removing pane(s), recompute the focused pane / active group / open flag. */
function resolveActive(
  prev: { activeId: string | null; activeGroupId: string | null; open: boolean },
  groups: TermGroup[],
  removedId: string,
): { activeId: string | null; activeGroupId: string | null; open: boolean } {
  let activeGroupId = prev.activeGroupId;
  let activeId = prev.activeId;
  // Keep the active group if it survived; otherwise fall back to the last group.
  if (!activeGroupId || !groups.some((g) => g.id === activeGroupId)) {
    activeGroupId = groups[groups.length - 1]?.id ?? null;
  }
  // Keep the focused pane if it survived and belongs to the active group;
  // otherwise focus the active group's last pane.
  const active = groups.find((g) => g.id === activeGroupId);
  if (!activeId || activeId === removedId || !active?.paneIds.includes(activeId)) {
    activeId = active?.paneIds[active.paneIds.length - 1] ?? null;
  }
  return { activeId, activeGroupId, open: groups.length > 0 && prev.open };
}
