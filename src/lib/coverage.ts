/**
 * Reading coverage: aggregate the read-progress set (which files have been read)
 * against the project's file list into an overall figure, a per-top-level-folder
 * breakdown, and the changed-since-read list. Pure — no I/O, no store access — so
 * it's trivially testable and the panel just renders the result.
 */

/** Coverage of one top-level area of the project. */
export interface FolderCoverage {
  /** Top-level directory name, or "" for files sitting at the project root. */
  path: string;
  read: number;
  total: number;
}

export interface Coverage {
  read: number;
  total: number;
  /** Whole-percent read, 0 when the project has no readable files. */
  pct: number;
  /** Per-top-level-folder rows, largest area first. */
  folders: FolderCoverage[];
  /** Read files that changed externally since (worth re-reading), sorted. */
  changed: string[];
}

/** First path segment of a forward-slashed relative path, or "" at the root. */
function topFolder(rel: string): string {
  const i = rel.indexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

/**
 * @param files   project-relative, forward-slashed paths the tree would show
 * @param read    project-relative paths marked read
 * @param changed project-relative read paths that changed since being read
 */
export function computeCoverage(
  files: string[],
  read: ReadonlySet<string>,
  changed: ReadonlySet<string>,
): Coverage {
  const fileSet = new Set(files);
  const byFolder = new Map<string, { read: number; total: number }>();
  let readCount = 0;

  for (const f of files) {
    const key = topFolder(f);
    let row = byFolder.get(key);
    if (!row) byFolder.set(key, (row = { read: 0, total: 0 }));
    row.total++;
    if (read.has(f)) {
      row.read++;
      readCount++;
    }
  }

  const folders: FolderCoverage[] = [...byFolder.entries()]
    .map(([path, r]) => ({ path, read: r.read, total: r.total }))
    // Largest area first (that's where most reading lives); alphabetical tiebreak
    // so the order is stable across renders. Root bucket ("") sorts by name last.
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path));

  // Only surface changed files that are still in the tree (a deleted file that
  // was flagged changed shouldn't linger in the list).
  const changedList = [...changed].filter((f) => fileSet.has(f)).sort();

  const total = files.length;
  return {
    read: readCount,
    total,
    pct: total === 0 ? 0 : Math.round((readCount / total) * 100),
    folders,
    changed: changedList,
  };
}
