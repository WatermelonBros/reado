/**
 * Bridge between the language-server diagnostics (in `lsp.ts`, outside React)
 * and the editor's comment composer. A diagnostic's "Create task" action
 * dispatches this effect on its own view; the editor catches it and opens the
 * composer for that line, prefilled with the diagnostic message.
 */
import { StateEffect } from "@codemirror/state"

export const taskFromDiagnostic = StateEffect.define<{
  from: number
  to: number
  message: string
}>()

/** "Explain this with AI" from the hover tooltip: the editor catches it and asks
 * the focused agent to explain the symbol at `pos`, using the server's hover
 * docs as context. */
export const explainSymbolAt = StateEffect.define<{ pos: number }>()

/** A code lens carrying several locations was clicked: the editor catches this
 *  and offers them as a list at the click point. Locations are already resolved
 *  to absolute paths and 1-based lines — the menu only has to show and open. */
export const showLensLocations = StateEffect.define<{
  x: number
  y: number
  locations: Array<{ path: string; line: number }>
}>()
