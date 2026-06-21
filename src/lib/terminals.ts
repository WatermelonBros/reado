/**
 * Integrated-terminal state.
 *
 * Tracks the open terminal tabs and the bottom panel's visibility. The PTY
 * sessions themselves live in the Rust backend and outlive tab switches; each
 * tab's `<Terminal>` component stays mounted (hidden when inactive) so its
 * scrollback and PTY connection persist.
 */
import { create } from "zustand";

export interface TermSession {
  id: string;
  title: string;
}

let counter = 0;
const newId = () => `t_${Date.now().toString(36)}_${counter++}`;

interface TerminalsState {
  sessions: TermSession[];
  activeId: string | null;
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
  /** Create a terminal tab and focus it; opens the panel. Returns its id. */
  add: () => string;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  /** Toggle (or set) the panel; opening with no tabs creates the first one. */
  toggle: (open?: boolean) => void;
}

export const useTerminals = create<TerminalsState>((set, get) => ({
  sessions: [],
  activeId: null,
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
    const n = get().sessions.length + 1;
    set((s) => ({
      sessions: [...s.sessions, { id, title: `Terminal ${n}` }],
      activeId: id,
      open: true,
    }));
    return id;
  },

  remove: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((t) => t.id !== id);
      const activeId =
        s.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeId;
      return { sessions, activeId, open: sessions.length > 0 && s.open };
    }),

  setActive: (id) => set({ activeId: id }),
  setTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  toggle: (open) =>
    set((s) => {
      const next = open ?? !s.open;
      if (next && s.sessions.length === 0) {
        const id = newId();
        return { open: true, sessions: [{ id, title: "Terminal 1" }], activeId: id };
      }
      return { open: next };
    }),
}));
