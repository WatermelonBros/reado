/**
 * Per-file error counts from the language server, surfaced outside the editor
 * (e.g. red filenames in the tree). Fed by a tap on `publishDiagnostics` in
 * `lsp.ts`; read by the file tree. Keyed by absolute path.
 */
import { create } from "zustand";

interface DiagState {
  errors: Record<string, number>;
  /** Set (or clear, when count is 0) the error count for an absolute path. */
  setErrors: (path: string, count: number) => void;
  reset: () => void;
}

export const useDiagnostics = create<DiagState>((set) => ({
  errors: {},
  setErrors: (path, count) =>
    set((s) => {
      if ((s.errors[path] ?? 0) === count) return s; // no-op, keep the ref stable
      const errors = { ...s.errors };
      if (count > 0) errors[path] = count;
      else delete errors[path];
      return { errors };
    }),
  reset: () => set({ errors: {} }),
}));
