/**
 * Bracket pair colourisation: each `()`/`[]`/`{}` is tinted by how deeply it is
 * nested, so the pair you are looking at is findable without counting.
 *
 * Depth is a property of the whole document, not of the viewport — a bracket's
 * colour must not change when you scroll to it — so the pass runs from position
 * zero on every document change and caches its result. The viewport only
 * decides which of the cached brackets get decorated.
 */
import { syntaxTree } from "@codemirror/language"
import { type EditorState, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"

/** How many colours the cycle has. Six is enough that two visually adjacent
 *  levels never share one, and few enough that all six stay distinguishable. */
const LEVELS = 6

/**
 * Documents above this size are left uncoloured.
 *
 * ponytail: full rescan on every edit, capped by size. The cap sits above the
 * default large-file guard (2 MB), so in practice a file you can open is a file
 * that gets colours. Incremental re-scan from the edit point if that changes.
 */
const MAX_DOC = 2_000_000

const OPEN = "([{"
const CLOSE = ")]}"

const marks = Array.from({ length: LEVELS }, (_, i) =>
  Decoration.mark({ class: `cm-bracket-l${i}` }),
)
/** A closer with nothing to close: coloured as an error rather than left plain,
 *  which is the whole reason to look at bracket colours in the first place. */
const unmatched = Decoration.mark({ class: "cm-bracket-unmatched" })

interface Found {
  pos: number
  /** The decoration to apply — a level mark, or the unmatched mark. */
  deco: Decoration
}

/** Whether the token at `pos` is code rather than the inside of a string,
 *  comment or regex, where a brace is just a character. */
function isCode(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent as never) {
    if (/comment|string|regex|literal/i.test(node.name)) return false
    if (!node.parent) return true
  }
  return true
}

/** Every bracket in the document with the colour it should get. */
function scan(state: EditorState): Found[] {
  const out: Found[] = []
  if (state.doc.length > MAX_DOC) return out
  const text = state.doc.toString()
  const stack: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const opening = OPEN.indexOf(ch)
    const closing = CLOSE.indexOf(ch)
    if (opening < 0 && closing < 0) continue
    if (!isCode(state, i)) continue
    if (opening >= 0) {
      out.push({ pos: i, deco: marks[stack.length % LEVELS] })
      stack.push(opening)
      continue
    }
    // A closer only pops when it matches the innermost opener; `(]` leaves the
    // paren open rather than silently consuming it.
    if (stack.length && stack[stack.length - 1] === closing) {
      stack.pop()
      out.push({ pos: i, deco: marks[stack.length % LEVELS] })
    } else {
      out.push({ pos: i, deco: unmatched })
    }
  }
  return out
}

/** Decorate only the brackets the viewport can show. */
function visible(found: Found[], view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    // The list is position-ordered, so a linear walk is fine; the ranges are
    // few and the scan stops at the first bracket past the window.
    for (const f of found) {
      if (f.pos < from) continue
      if (f.pos >= to) break
      builder.add(f.pos, f.pos + 1, f.deco)
    }
  }
  return builder.finish()
}

export const bracketColors = ViewPlugin.fromClass(
  class {
    found: Found[]
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.found = scan(view.state)
      this.decorations = visible(this.found, view)
    }

    update(u: ViewUpdate) {
      // The syntax tree arrives asynchronously for big documents, so a rescan
      // is also needed when the highlighting catches up — otherwise brackets
      // parsed as code after the fact keep the colours they got while the tree
      // was still empty.
      if (u.docChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.found = scan(u.state)
      } else if (!u.viewportChanged) {
        return
      }
      this.decorations = visible(this.found, u.view)
    }
  },
  { decorations: (v) => v.decorations },
)
