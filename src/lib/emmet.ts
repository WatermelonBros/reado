/**
 * Emmet: expand `div.card>ul>li*3` into the markup it stands for.
 *
 * Reado is a read-first editor, so this is deliberately quiet — bound to Tab and
 * only where an abbreviation actually sits before the cursor, in a language
 * where one could mean something. Everywhere else Tab still indents, which is
 * what it does the other 99% of the time.
 *
 * The abbreviation grammar is the real one (the `emmet` package), not a
 * hand-rolled subset: a half-implemented Emmet that silently drops `*3` or
 * `[attr]` is worse than none.
 */

import { snippet } from "@codemirror/autocomplete"
import { indentUnit, syntaxTree } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"
import type { Command, EditorView } from "@codemirror/view"
import expand, { extract } from "emmet"
import { extOf } from "./formatters"

/** Which Emmet dialect a file is written in, or null when it is neither. */
export function emmetSyntax(path: string): "html" | "css" | null {
  const ext = extOf(path)
  if (["html", "htm", "xhtml", "vue", "svelte", "astro", "jsx", "tsx", "php"].includes(ext)) {
    return "html"
  }
  if (["css", "scss", "sass", "less"].includes(ext)) return "css"
  return null
}

/**
 * Whether `pos` sits somewhere an abbreviation could mean anything.
 *
 * Inside a comment or a string it can't, and expanding there would rewrite prose
 * the reader was in the middle of typing. In a JSX/TSX file everything outside a
 * JSX element is ordinary TypeScript, where `div.card` is a property access.
 */
function inMarkupContext(state: EditorState, pos: number, jsxOnly: boolean): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1)
  let sawJsx = false
  while (node.parent) {
    if (/comment|string/i.test(node.name)) return false
    if (/jsx/i.test(node.name)) sawJsx = true
    node = node.parent
  }
  return jsxOnly ? sawJsx : true
}

/** The abbreviation immediately before `pos`, if there is one. */
export function abbreviationAt(
  state: EditorState,
  pos: number,
): { from: number; text: string } | null {
  const line = state.doc.lineAt(pos)
  const found = extract(line.text, pos - line.from)
  if (!found?.abbreviation) return null
  // Only an abbreviation that ends *at* the cursor: expanding one the caret has
  // already moved past would rewrite text the reader is no longer looking at.
  if (found.end !== pos - line.from) return null
  return { from: line.from + found.start, text: found.abbreviation }
}

/**
 * Expand the abbreviation before the cursor.
 *
 * Returns false — leaving Tab to indent — when there is nothing to expand, when
 * the position isn't markup, or when the abbreviation is a single bare word:
 * `div` alone is far more often a word being typed than an abbreviation, and a
 * Tab that silently turns it into `<div></div>` is the reason people switch
 * Emmet off.
 */
export function expandAbbreviation(view: EditorView, path: string): boolean {
  const syntax = emmetSyntax(path)
  if (!syntax) return false
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const found = abbreviationAt(state, range.head)
  if (!found) return false
  const isJsx = /\.[jt]sx$/i.test(path)
  if (!inMarkupContext(state, range.head, isJsx)) return false
  // A bare tag name is a word until proven otherwise.
  if (syntax === "html" && /^[a-z][a-z0-9]*$/i.test(found.text)) return false

  let expanded: string
  try {
    expanded = expand(found.text, {
      type: syntax === "css" ? "stylesheet" : "markup",
      syntax,
      options: {
        "output.field": (index, placeholder) =>
          `\${${index}${placeholder ? `:${placeholder}` : ""}}`,
        "output.indent": state.facet(indentUnit),
      },
    })
  } catch {
    return false // not a valid abbreviation after all
  }
  if (!expanded || expanded === found.text) return false

  // Through the snippet machinery, so the tab stops Emmet emits are real ones
  // you can Tab between rather than literal `${1}` in the document.
  snippet(expanded)(
    { state, dispatch: view.dispatch },
    { label: found.text },
    found.from,
    range.head,
  )
  return true
}

/** Tab: expand an abbreviation here, or fall through to whatever Tab does. */
export const emmetTab =
  (path: string): Command =>
  (view) =>
    expandAbbreviation(view, path)
