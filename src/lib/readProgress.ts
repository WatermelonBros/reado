/**
 * Reading progress: which files have been read in the current project.
 *
 * Mirrors `.reado/read.json` (the backend is the source of truth). Paths are
 * project-relative, forward-slashed (same shape as comment anchors).
 */
import { create } from "zustand";
import { listRead, setReadState } from "./api";

interface ReadProgressState {
  /** Project-relative paths marked read. */
  read: Set<string>;
  load: (root: string) => Promise<void>;
  /** Mark a path read/unread, optimistically + persisted. */
  mark: (root: string, relPath: string, read: boolean) => void;
}

export const useReadProgress = create<ReadProgressState>((set, get) => ({
  read: new Set(),
  load: async (root) => {
    const paths = await listRead(root).catch(() => [] as string[]);
    set({ read: new Set(paths) });
  },
  mark: (root, relPath, read) => {
    const next = new Set(get().read);
    if (read) next.add(relPath);
    else next.delete(relPath);
    set({ read: next });
    void setReadState(root, relPath, read).catch(() => {});
  },
}));
