/**
 * Call & type hierarchy panel state. Populated by the "Show Call/Type Hierarchy"
 * commands (lib/docInfo) from the language server, rendered by HierarchyPanel.
 * One level deep with a direction toggle; clicking a node jumps to it.
 */
import { create } from "zustand";
import type { HierNode } from "./lsp";

export type HierMode = "call" | "type";
/** call: incoming (callers) / outgoing (callees); type: super (bases) / sub (impls). */
export type HierDir = "incoming" | "outgoing" | "super" | "sub";

interface HierState {
  mode: HierMode;
  direction: HierDir;
  root: HierNode | null;
  results: HierNode[];
  loading: boolean;
  /** True when a prepare returned nothing / the server lacks the capability. */
  unsupported: boolean;
  set: (patch: Partial<HierState>) => void;
}

export const useHierarchy = create<HierState>((set) => ({
  mode: "call",
  direction: "incoming",
  root: null,
  results: [],
  loading: false,
  unsupported: false,
  set: (patch) => set(patch),
}));
