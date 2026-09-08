/**
 * Fold to a level — "collapse this file down to its top two layers", which is
 * how you read an unfamiliar file for the first time.
 *
 * `@codemirror/language` gives fold-one and fold-all; the levels in between are
 * built here from the same `foldable()` the gutter uses, so a range is folded
 * exactly when the editor would have offered to fold it.
 *
 * Depth is measured by *indentation column*, not by syntax nesting: it is the
 * definition a reader already has in their eye, it works in a language with no
 * grammar loaded, and it agrees with the gutter's own arrows.
 */
import { foldable, foldEffect, unfoldAll } from "@codemirror/language"
import type { Command } from "@codemirror/view"

/** Every foldable line in the document, with the indent column it sits at. */
function foldableLines(view: Parameters<Command>[0]) {
  const { state } = view
  const out: { level: number; range: { from: number; to: number } }[] = []
  const tab = state.tabSize
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const range = foldable(state, line.from, line.to)
    if (!range) continue
    // Columns, not characters: a tab-indented file and a space-indented one
    // have to come out at the same depths.
    let col = 0
    for (const ch of line.text) {
      if (ch === "\t") col += tab - (col % tab)
      else if (ch === " ") col++
      else break
    }
    out.push({ level: col, range })
  }
  return out
}

/**
 * Fold every range whose indentation is at or below `level` (1-based, as in
 * VS Code: level 1 is the outermost).
 *
 * Unfolds first, so asking for level 2 after level 3 opens back up instead of
 * only ever collapsing further.
 */
export const foldToLevel =
  (level: number): Command =>
  (view) => {
    unfoldAll(view)
    const lines = foldableLines(view)
    if (lines.length === 0) return false
    // The distinct indent columns present, ascending: the Nth of them is what
    // "level N" means for *this* file, whatever its indent width happens to be.
    const columns = [...new Set(lines.map((l) => l.level))].sort((a, b) => a - b)
    const cutoff = columns[level - 1]
    if (cutoff === undefined) return false
    // Only the ranges *at* that depth, as in VS Code. Folding the deeper ones
    // too would hide them behind an outer fold and leave them collapsed when it
    // is opened again — a state nobody asked for.
    const effects = lines
      .filter((l) => l.level === cutoff)
      .map((l) => foldEffect.of({ from: l.range.from, to: l.range.to }))
    if (effects.length === 0) return false
    view.dispatch({ effects })
    return true
  }
