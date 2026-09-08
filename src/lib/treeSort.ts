/**
 * File-tree ordering and the on-screen filter.
 *
 * The backend already returns directories first, then names — the order almost
 * everyone wants. Re-sorting here rather than asking the backend for another
 * order keeps the setting instant: flipping it re-renders, it doesn't re-list.
 */
import type { DirEntry } from "./api"

export type ExplorerSort = "name" | "type" | "modified"

const extOf = (name: string) => {
  const i = name.lastIndexOf(".")
  // A leading dot is the whole name (`.gitignore`), not an extension.
  return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

/**
 * Order one folder's entries. Directories always come first, in every mode:
 * mixing them into a by-date list turns the tree into a flat pile.
 */
export function sortEntries(entries: DirEntry[], mode: ExplorerSort): DirEntry[] {
  const byName = (a: DirEntry, b: DirEntry) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    if (mode === "type" && !a.isDir) {
      const byExt = extOf(a.name).localeCompare(extOf(b.name))
      if (byExt !== 0) return byExt
    }
    if (mode === "modified") {
      // Newest first — "what did I touch last" is the only reason to ask.
      // Entries with no reported mtime sort last rather than to the top.
      const at = a.modified ?? -1
      const bt = b.modified ?? -1
      if (at !== bt) return bt - at
    }
    return byName(a, b)
  })
}

/**
 * Narrow one folder's listing to a filter.
 *
 * This filters the rows on screen, which is what the explorer's filter is for;
 * finding a file anywhere in the project is Go to File. An expanded directory is
 * always kept, matching or not — hiding it would rip the visible subtree it
 * contains out from under the reader.
 */
export function filterEntries(
  entries: DirEntry[],
  filter: string,
  isExpanded: (entry: DirEntry) => boolean,
): DirEntry[] {
  const needle = filter.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((e) => e.name.toLowerCase().includes(needle) || (e.isDir && isExpanded(e)))
}
