/**
 * Paths the user has chosen to open as text instead of their rich rendering.
 *
 * SVGs (and other text-backed formats) render as images by default, but they
 * are editable source too. "Open as text" flags a path here; the editor then
 * fetches and shows it as code. The set is per-session and not persisted.
 */
import { create } from "zustand";

interface TextViewState {
  /** Absolute paths to force-open as text. */
  force: Set<string>;
  openAsText: (path: string) => void;
  /** Flip a path between its rich rendering and source (e.g. markdown). */
  toggleText: (path: string) => void;
}

export const useTextView = create<TextViewState>((set) => ({
  force: new Set(),
  openAsText: (path) => set((s) => ({ force: new Set(s.force).add(path) })),
  toggleText: (path) =>
    set((s) => {
      const force = new Set(s.force);
      if (force.has(path)) force.delete(path);
      else force.add(path);
      return { force };
    }),
}));
