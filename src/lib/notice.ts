/**
 * App-wide transient notice (toast). A minimal channel for lib code (no React
 * context) to surface a message — e.g. "the AI agent isn't installed" — instead
 * of failing silently. Rendered once by `Notice` at the app root.
 */
import { create } from "zustand";

export interface NoticeState {
  notice: { kind: "info" | "error"; text: string } | null;
  show: (kind: "info" | "error", text: string) => void;
  clear: () => void;
}

export const useNotice = create<NoticeState>((set) => ({
  notice: null,
  show: (kind, text) => set({ notice: { kind, text } }),
  clear: () => set({ notice: null }),
}));
