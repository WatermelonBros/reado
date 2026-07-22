/**
 * The agent's live reasoning feed — the human-facing half of the `reado thought`
 * experiment. The CLI appends lines to `.reado/reasoning.jsonl`, the backend
 * watcher emits `reasoning-changed`, and this store re-reads the file so the
 * ReasoningPanel stays live while the agent works.
 *
 * ponytail: transient, not persisted — it mirrors an on-disk file, so there's
 * nothing to keep across reloads. Auto-places itself in the dock (beside the
 * terminal) and pops open the first time a thought lands, so it "just appears"
 * without a toggle to hunt for.
 */
import { create } from "zustand";
import { reasoningRead, reasoningClear, type Thought } from "./api";
import { useLayout, findPanel } from "./layout";

interface ReasoningStore {
  open: boolean;
  /** Already auto-revealed this run — so closing it doesn't re-pop on the next line. */
  revealed: boolean;
  /** The project this feed belongs to — guards stale, out-of-order reads and
   *  re-arms the auto-reveal on a project switch. */
  root: string;
  thoughts: Thought[];
  load: (root: string) => Promise<void>;
  clear: (root: string) => Promise<void>;
  toggle: () => void;
  close: () => void;
}

// A layout persisted before this panel existed won't contain it, so ensure it's
// placed (bottom area, splitting a new group beside the terminal) before showing.
function ensurePlaced() {
  if (!findPanel(useLayout.getState().layout, "reasoning")) {
    useLayout.getState().move("reasoning", "bottom", { split: true });
  }
}

export const useReasoning = create<ReasoningStore>((set, get) => ({
  open: false,
  revealed: false,
  root: "",
  thoughts: [],
  load: async (root) => {
    // A project switch: drop the previous feed and re-arm the auto-reveal so the
    // new project's first thought pops the panel again.
    if (get().root !== root) set({ root, thoughts: [], revealed: false });
    const thoughts = await reasoningRead(root).catch(() => []);
    // Guard against a stale read landing after the project changed.
    if (get().root !== root) return;
    set({ thoughts });
    // First thought of a run pops the panel open beside the terminal, once.
    if (thoughts.length > 0 && !get().revealed) {
      ensurePlaced();
      set({ open: true, revealed: true });
    }
  },
  clear: async (root) => {
    await reasoningClear(root).catch(() => {});
    set({ thoughts: [], revealed: false });
  },
  toggle: () => {
    const next = !get().open;
    if (next) ensurePlaced();
    set({ open: next });
  },
  close: () => set({ open: false }),
}));
