/**
 * Knowledge-base sources beyond comments and specs: the project's own docs —
 * README, `docs/**`, and other top-level markdown (product/code documentation).
 * Spec/plan trees and build/vendor dirs are excluded (specs are their own view).
 */
export interface DocItem {
  /** Display label (path relative to the project). */
  label: string;
  /** Project-relative path. */
  path: string;
}

const EXCLUDE = /(?:^|\/)(?:\.?openspec|\.specify|node_modules|\.git|target|dist|build|\.next|vendor)\//;

/** Rank docs so READMEs and root docs surface first, then `docs/`, then rest. */
function rank(path: string): number {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  const topLevel = !path.includes("/");
  if (/^readme\./.test(base)) return topLevel ? 0 : 1;
  if (topLevel) return 2;
  if (/^docs\//.test(path)) return 3;
  return 4;
}

/** The project's documentation markdown, ordered for a knowledge-base index. */
export function listDocs(files: string[]): DocItem[] {
  return files
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.(md|markdown|mdx)$/i.test(f) && !EXCLUDE.test(f))
    .map((f) => ({ path: f, label: f }))
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
}
