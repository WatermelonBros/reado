/**
 * The contexts a keybinding's `when` clause can name.
 *
 * Evaluated from what is on screen at the moment of the keystroke rather than
 * kept in a store: a mirror of "where the caret is" would need updating from
 * every component that can take focus, and would be wrong the first time one
 * forgot. Reading the DOM at press time cannot drift.
 */
import { useDocInfo } from "./docInfo"
import { usePalette } from "./store"

/** Every context Reado understands. A clause naming anything else is a mistake
 *  worth reporting, not a condition that quietly never holds. */
export const CONTEXTS = [
  "editorFocus",
  "terminalFocus",
  "inputFocus",
  "paletteOpen",
  "dialogOpen",
  "editorHasSelection",
  "sidebarFocus",
] as const

export type Context = (typeof CONTEXTS)[number]

const KNOWN = new Set<string>(CONTEXTS)

/** Whether `name` is a context at all — the check behind "unknown context". */
export const isContext = (name: string): name is Context => KNOWN.has(name)

/** The contexts that hold right now. */
export function currentContexts(): Set<string> {
  const on = new Set<string>()
  const el = document.activeElement as HTMLElement | null
  const inEditor = !!el?.closest?.(".cm-editor")
  const inTerminal = !!el?.closest?.(".xterm")
  if (inEditor) on.add("editorFocus")
  if (inTerminal) on.add("terminalFocus")
  // A CodeMirror editor is a contenteditable and an xterm keeps a hidden
  // textarea, so "a text field" means the ones that are not those.
  if (
    !inEditor &&
    !inTerminal &&
    (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || !!el?.isContentEditable)
  )
    on.add("inputFocus")
  const palette = usePalette.getState()
  if (palette.mode !== null) on.add("paletteOpen")
  if (palette.settingsOpen || palette.shortcutsOpen || document.querySelector("[role=dialog]"))
    on.add("dialogOpen")
  if (el?.closest?.("[data-sidebar]")) on.add("sidebarFocus")
  // Straight from the focused view: a mirrored "has a selection" flag would be
  // one more thing to keep in step with every cursor move.
  const view = useDocInfo.getState().view
  if (inEditor && view && !view.state.selection.main.empty) on.add("editorHasSelection")
  return on
}

/**
 * Whether a clause holds. `!` negates a context, `&&` joins them, and an empty
 * clause is "always" — which is what makes an unconditional binding the
 * fallback rather than a special case.
 *
 * Returns `false` for a clause naming something unknown: a binding that cannot
 * be evaluated must not fire.
 */
export function clauseHolds(clause: string | undefined, on: Set<string>): boolean {
  if (!clause?.trim()) return true
  return clause.split("&&").every((part) => {
    const term = part.trim()
    const negated = term.startsWith("!")
    const name = (negated ? term.slice(1) : term).trim()
    if (!isContext(name)) return false
    return negated ? !on.has(name) : on.has(name)
  })
}

/** The context names a clause mentions that Reado does not know. */
export function unknownContexts(clause: string | undefined): string[] {
  if (!clause?.trim()) return []
  return clause
    .split("&&")
    .map((part) => part.trim().replace(/^!/, "").trim())
    .filter((name) => name && !isContext(name))
}
