/**
 * Diagnostics from the language servers, surfaced outside the editor: per-file
 * error counts (red filenames in the tree) and the full per-file list (the
 * Problems panel). Fed by a tap on `publishDiagnostics` in `lsp.ts`. Keyed by
 * absolute path. Note: scope is whatever the servers publish — workspace-wide
 * for servers like rust-analyzer, open-file-only for others.
 */
import { create } from "zustand";

/** One diagnostic, in the shape the Problems panel needs to render + navigate. */
export interface DiagItem {
  /** 1-based line for navigation. */
  line: number;
  /** 0-based column. */
  character: number;
  /** LSP severity: 1 error, 2 warning, 3 info, 4 hint. */
  severity: number;
  message: string;
}

interface DiagState {
  /** Full diagnostics per absolute path (for the Problems panel). */
  byFile: Record<string, DiagItem[]>;
  /** Error count per absolute path (for the tree's red filenames). */
  errors: Record<string, number>;
  /** Replace a file's diagnostics (clears the entry when the list is empty). */
  setFileDiagnostics: (path: string, items: DiagItem[]) => void;
  reset: () => void;
}

export const useDiagnostics = create<DiagState>((set) => ({
  byFile: {},
  errors: {},
  setFileDiagnostics: (path, items) =>
    set((s) => {
      const byFile = { ...s.byFile };
      const errors = { ...s.errors };
      if (items.length) {
        byFile[path] = items;
        const errCount = items.filter((d) => d.severity === 1).length;
        if (errCount > 0) errors[path] = errCount;
        else delete errors[path];
      } else {
        delete byFile[path];
        delete errors[path];
      }
      return { byFile, errors };
    }),
  reset: () => set({ byFile: {}, errors: {} }),
}));
