/**
 * Reading progress: which files have been read in the current project.
 *
 * Mirrors `.reado/read.json` (the backend is the source of truth). Paths are
 * project-relative, forward-slashed (same shape as comment anchors).
 */
import { create } from "zustand";
import { listRead, setReadState, readFile } from "./api";

/** Sentinel diff base: diff the current file against its last-read snapshot
 *  (the `read-delta` review) instead of a git ref. */
export const LAST_READ_BASE = "reado:lastread";

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
  /** Read files that changed externally since being read (have a delta to review). */
  changed: Set<string>;
  load: (root: string) => Promise<void>;
  /** Mark a path read/unread, optimistically + persisted. When marking read,
   *  the content is snapshotted (passed in, or read from disk) so a later change
   *  can be reviewed as a delta. */
  mark: (root: string, relPath: string, read: boolean, content?: string) => void;
  /** Bulk mark many paths read/unread in one state update (e.g. a whole folder),
   *  snapshotting each file's content from disk when marking read. */
  markMany: (root: string, relPaths: string[], read: boolean) => void;
  /** Flag a read file as changed-since-read (a delta is available to review). */
  markChanged: (relPath: string) => void;
  /** Clear the changed flag (e.g. after reviewing the delta). */
  clearChanged: (relPath: string) => void;
}

export const useReadProgress = create<ReadProgressState>((set, get) => ({
  read: new Set(),
  changed: new Set(),
  load: async (root) => {
    const paths = await listRead(root).catch(() => [] as string[]);
    set({ read: new Set(paths), changed: new Set() });
  },
  mark: (root, relPath, read, content) => {
    const next = new Set(get().read);
    const changed = new Set(get().changed);
    if (read) {
      next.add(relPath);
      changed.delete(relPath); // reading clears any pending delta
    } else {
      next.delete(relPath);
    }
    set({ read: next, changed });
    if (!read) {
      void setReadState(root, relPath, false).catch(() => {});
      return;
    }
    // Snapshot the content so a later external change can be reviewed as a delta.
    if (content !== undefined) {
      void setReadState(root, relPath, true, content).catch(() => {});
    } else {
      readFile(root, relPath)
        .then((c) => setReadState(root, relPath, true, c.kind === "text" ? c.text : undefined))
        .catch(() => void setReadState(root, relPath, true).catch(() => {}));
    }
  },
  markMany: (root, relPaths, read) => {
    if (relPaths.length === 0) return;
    const next = new Set(get().read);
    const changed = new Set(get().changed);
    for (const relPath of relPaths) {
      if (read) {
        next.add(relPath);
        changed.delete(relPath); // reading clears any pending delta
      } else {
        next.delete(relPath);
      }
    }
    set({ read: next, changed });
    // Persist each file, snapshotting content so a later change reviews as a delta.
    for (const relPath of relPaths) {
      if (!read) {
        void setReadState(root, relPath, false).catch(() => {});
      } else {
        readFile(root, relPath)
          .then((c) => setReadState(root, relPath, true, c.kind === "text" ? c.text : undefined))
          .catch(() => void setReadState(root, relPath, true).catch(() => {}));
      }
    }
  },
  markChanged: (relPath) => set((s) => ({ changed: new Set(s.changed).add(relPath) })),
  clearChanged: (relPath) =>
    set((s) => {
      const changed = new Set(s.changed);
      changed.delete(relPath);
      return { changed };
    }),
}));
