/**
 * Reading bookmarks: lightweight "return here" pins, distinct from comments
 * (no annotation, never sent to an AI agent). Mirrors `.reado/bookmarks.json`
 * (the backend is the source of truth). Paths are project-relative, forward-
 * slashed (same shape as comment anchors / read progress).
 */
import { create } from "zustand";
import { getBookmarks, setBookmarks, type Bookmark } from "./api";

interface BookmarksState {
  bookmarks: Bookmark[];
  load: (root: string) => Promise<void>;
  /** Toggle a bookmark at `path`/`line`: removes a matching one, else adds it. */
  toggle: (root: string, b: Bookmark) => void;
  /** Remove the bookmark at `path`/`line`. */
  remove: (root: string, path: string, line: number) => void;
}

const persist = (root: string, bookmarks: Bookmark[]) =>
  void setBookmarks(root, bookmarks).catch(() => {});

export const useBookmarks = create<BookmarksState>((set, get) => ({
  bookmarks: [],
  load: async (root) => {
    const bookmarks = await getBookmarks(root).catch(() => [] as Bookmark[]);
    set({ bookmarks });
  },
  toggle: (root, b) => {
    const existing = get().bookmarks.find((x) => x.path === b.path && x.line === b.line);
    const next = existing
      ? get().bookmarks.filter((x) => !(x.path === b.path && x.line === b.line))
      : [...get().bookmarks, b];
    set({ bookmarks: next });
    persist(root, next);
  },
  remove: (root, path, line) => {
    const next = get().bookmarks.filter((x) => !(x.path === path && x.line === line));
    set({ bookmarks: next });
    persist(root, next);
  },
}));
