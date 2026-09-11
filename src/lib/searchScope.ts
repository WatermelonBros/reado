/**
 * "Find in selection" — the find panel, confined to a range.
 *
 * `@codemirror/search` has no notion of a scope: its commands work over the
 * whole document. What it does have is `SearchQuery.getCursor(state, from, to)`,
 * and that is the entire mechanism — with a range, finding, counting and
 * replacing are the same operations over narrower bounds.
 *
 * The range is frozen when the mode is turned on rather than following the
 * selection, because the first Find Next selects a match *inside* it: a scope
 * that tracked the selection would destroy itself on its own first use. It is
 * mapped through every document change instead, so replacing a match with longer
 * text does not push the rest of the range out of scope.
 *
 * Every command here falls back to the library's own when no range is set, so
 * they can be bound unconditionally.
 */
import {
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  type SearchQuery,
  searchPanelOpen,
} from "@codemirror/search"
import { type EditorState, StateEffect, StateField } from "@codemirror/state"
import { type Command, Decoration, type DecorationSet, EditorView } from "@codemirror/view"

export interface SearchRange {
  from: number
  to: number
}

/** Set (or clear, with null) the range find and replace are confined to. */
export const setSearchScope = StateEffect.define<SearchRange | null>()

const scopeMark = Decoration.mark({ class: "cm-search-scope" })

/** The active find range, mapped through edits. */
export const searchScope = StateField.define<SearchRange | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSearchScope)) return e.value
    const wasOpen = searchPanelOpen(tr.startState)
    const isOpen = searchPanelOpen(tr.state)
    // Opening the panel with more than one line selected means "in here": the
    // user is pointing at a region, not at a string. Decided in the field rather
    // than in the panel because a panel is mounted *during* an editor update,
    // where it cannot dispatch anything.
    if (!wasOpen && isOpen) {
      const sel = tr.startState.selection.main
      const text = sel.empty ? "" : tr.startState.doc.sliceString(sel.from, sel.to)
      return text.includes("\n") ? { from: sel.from, to: sel.to } : null
    }
    // Closing it ends the scope: an invisible range that still narrowed the next
    // search would be a haunting.
    if (wasOpen && !isOpen) return null
    if (!value || !tr.docChanged) return value
    // The start holds against text inserted at it; the end moves with text
    // inserted inside it. A range that has collapsed is no longer a scope.
    const from = tr.changes.mapPos(value.from, 1)
    const to = tr.changes.mapPos(value.to, -1)
    return to > from ? { from, to } : null
  },
  provide: (f) =>
    EditorView.decorations.from(
      f,
      (range): DecorationSet =>
        range ? Decoration.set([scopeMark.range(range.from, range.to)]) : Decoration.none,
    ),
})

/** The range in force, or null when finding is document-wide. */
export const scopeOf = (state: EditorState): SearchRange | null =>
  state.field(searchScope, false) ?? null

/**
 * `\n`, `\r` and `\t` in a non-literal query mean those characters — the same
 * rule the library applies to the search string, applied to the replacement,
 * which is otherwise taken literally.
 */
const unquote = (text: string, literal: boolean) =>
  literal
    ? text
    : text.replace(/\\([nrt\\])/g, (_, ch: string) =>
        ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : "\\",
      )

/** The text one match is replaced by, expanding `$&` and `$1…$9` for a regex. */
function replacementFor(query: SearchQuery, match: RegExpExecArray | undefined): string {
  const text = unquote(query.replace, query.literal)
  if (!query.regexp || !match) return text
  return text.replace(/\$([$&\d])/g, (_, token: string) => {
    if (token === "$") return "$"
    if (token === "&") return match[0]
    return match[Number(token)] ?? ""
  })
}

/** Every match inside `range`, in document order. */
export function matchesIn(
  state: EditorState,
  range: SearchRange,
): Array<{ from: number; to: number; match?: RegExpExecArray }> {
  const query = getSearchQuery(state)
  if (!query.search || !query.valid) return []
  const out: Array<{ from: number; to: number; match?: RegExpExecArray }> = []
  const cursor = query.getCursor(state, range.from, range.to) as Iterator<{
    from: number
    to: number
    match?: RegExpExecArray
  }>
  for (let it = cursor.next(); !it.done; it = cursor.next()) out.push(it.value)
  return out
}

/** How many matches the range holds, and which one is selected (1-based, 0 for
 *  none) — the find panel's `n of m`, counted over the scope. */
export function countIn(
  state: EditorState,
  range: SearchRange,
): { current: number; total: number } {
  const sel = state.selection.main
  const all = matchesIn(state, range)
  const at = all.findIndex((m) => m.from === sel.from && m.to === sel.to)
  return { current: at + 1, total: all.length }
}

const select = (view: EditorView, m: { from: number; to: number }) => {
  view.dispatch({
    selection: { anchor: m.from, head: m.to },
    scrollIntoView: true,
    userEvent: "select.search",
  })
  return true
}

/** Find the next match inside the range, wrapping at its end. */
export const findNextInScope: Command = (view) => {
  const range = scopeOf(view.state)
  if (!range) return findNext(view)
  const all = matchesIn(view.state, range)
  if (!all.length) return false
  const after = view.state.selection.main.to
  return select(view, all.find((m) => m.from >= after) ?? all[0])
}

/** Find the previous match inside the range, wrapping at its start. */
export const findPrevInScope: Command = (view) => {
  const range = scopeOf(view.state)
  if (!range) return findPrevious(view)
  const all = matchesIn(view.state, range)
  if (!all.length) return false
  const before = view.state.selection.main.from
  const earlier = all.filter((m) => m.to <= before)
  return select(view, earlier.length ? earlier[earlier.length - 1] : all[all.length - 1])
}

/** Replace the selected match when it is one, then move to the next — inside
 *  the range only. */
export const replaceNextInScope: Command = (view) => {
  const range = scopeOf(view.state)
  if (!range) return replaceNext(view)
  const query = getSearchQuery(view.state)
  const sel = view.state.selection.main
  const all = matchesIn(view.state, range)
  const current = all.find((m) => m.from === sel.from && m.to === sel.to)
  if (!current) return findNextInScope(view)
  view.dispatch({
    changes: { from: current.from, to: current.to, insert: replacementFor(query, current.match) },
    userEvent: "input.replace",
  })
  return findNextInScope(view)
}

/** Replace every match inside the range, and nothing outside it. */
export const replaceAllInScope: Command = (view) => {
  const range = scopeOf(view.state)
  if (!range) return replaceAll(view)
  const query = getSearchQuery(view.state)
  const all = matchesIn(view.state, range)
  if (!all.length) return false
  view.dispatch({
    changes: all.map((m) => ({
      from: m.from,
      to: m.to,
      insert: replacementFor(query, m.match),
    })),
    userEvent: "input.replace.all",
  })
  return true
}
