import { LSPPlugin } from "@codemirror/lsp-client"
import { type EditorView, hoverTooltip, type Tooltip } from "@codemirror/view"
import { t } from "@/i18n"
import { explainSymbolAt } from "@/lib/lspActions"

interface HoverResult {
  contents: string | { value: string } | (string | { value: string })[]
}

/** Fetch the language server's hover documentation for the symbol at `pos`
 * (signature + docs), flattened to plain markdown text. Null when no server is
 * attached or there's nothing to show. Used to give the AI real context about a
 * symbol — especially from external libraries whose source isn't in the repo. */
export function lspHover(view: EditorView, pos: number): Promise<string | null> {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return Promise.resolve(null)
  plugin.client.sync()
  return plugin.client
    .request<unknown, HoverResult | null>("textDocument/hover", {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const c = res?.contents
      if (!c) return null
      const text =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c.map((x) => (typeof x === "string" ? x : x.value)).join("\n\n")
            : c.value
      return text.trim() || null
    })
    .catch(() => null)
}

/** Render the server's hover markdown into a calm DOM. We don't run a full
 * markdown parser (it would pull in a dep and risk HTML injection): fenced code
 * blocks go to <pre>, everything else is plain text. */
export function renderHoverDoc(md: string): HTMLElement {
  const section = document.createElement("div")
  section.className = "cm-tooltip-section"
  // Split on ``` fences; odd indices are code blocks (drop the language line).
  md.split("```").forEach((part, i) => {
    if (i % 2 === 1) {
      const pre = document.createElement("pre")
      pre.textContent = part.replace(/^[^\n]*\n/, "").replace(/\s+$/, "")
      section.appendChild(pre)
    } else {
      const text = part.trim()
      if (!text) return
      const div = document.createElement("div")
      div.textContent = text
      section.appendChild(div)
    }
  })
  return section
}

/** Our hover tooltip: the server's docs plus a "Spiegamelo con l'AI" chip that
 * hands the symbol (with these very docs as context) to the focused agent.
 * Replaces the library's `hoverTooltips()` so the action lives where the docs
 * are, not only in the context menu. */
export function lspHoverTooltip() {
  return hoverTooltip((view, pos): Promise<Tooltip | null> => {
    if (!LSPPlugin.get(view)) return Promise.resolve(null)
    const word = view.state.wordAt(pos)
    if (!word) return Promise.resolve(null)
    return lspHover(view, pos).then((docs) => {
      if (!docs) return null
      return {
        pos: word.from,
        end: word.to,
        create: () => {
          const dom = document.createElement("div")
          dom.appendChild(renderHoverDoc(docs))
          const actions = document.createElement("div")
          actions.className = "cm-tooltip-section"
          const chip = document.createElement("button")
          chip.type = "button"
          chip.className = "cm-diagnosticAction"
          chip.textContent = t("editor.explainSymbol")
          chip.onclick = () => view.dispatch({ effects: explainSymbolAt.of({ pos }) })
          actions.appendChild(chip)
          dom.appendChild(actions)
          return { dom }
        },
      }
    })
  })
}
