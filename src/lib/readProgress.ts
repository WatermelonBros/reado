/**
 * Reading progress: which files have been read in the current project.
 *
 * Mirrors `.reado/read.json` (the backend is the source of truth). Paths are
 * project-relative, forward-slashed (same shape as comment anchors).
 */
import { create } from "zustand";
import { listRead, setReadState } from "./api";

// Paths we just wrote ourselves (a manual save/format). The watcher's resulting
// `file-changed` should not flip the file back to "unread" — only *external*
// changes (e.g. an agent's edit) mean there's new content to re-read.
const selfWrites = new Set<string>();
/** Note that we just wrote `relPath`, suppressing the unread-on-change for it.
 *  A generous window tolerates a slow watcher; the flag is also consumed on the
 *  first matching change so a *later* external edit isn't wrongly suppressed. */
export function noteSelfWrite(relPath: string) {
  selfWrites.add(relPath);
  setTimeout(() => selfWrites.delete(relPath), 4000);
}
/** Whether `relPath`'s pending change is our own write (consumes the flag). */
export function wasSelfWrite(relPath: string): boolean {
  if (!selfWrites.has(relPath)) return false;
  selfWrites.delete(relPath);
  return true;
}

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
