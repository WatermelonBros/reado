import { LSPPlugin } from "@codemirror/lsp-client"
import { type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"

// ---- Inlay hints (inferred types + parameter names, inline) ---------------

interface InlayHint {
  position: { line: number; character: number }
  label: string | { value: string }[]
  paddingLeft?: boolean
  paddingRight?: boolean
}

class InlayWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly padL: boolean,
    readonly padR: boolean,
  ) {
    super()
  }
  eq(o: InlayWidget) {
    return o.label === this.label && o.padL === this.padL && o.padR === this.padR
  }
  toDOM() {
    const s = document.createElement("span")
    s.className = "cm-inlay-hint"
    if (this.padL) s.style.marginLeft = "0.4ch"
    if (this.padR) s.style.marginRight = "0.4ch"
    s.textContent = this.label
    return s
  }
}

const setInlays = StateEffect.define<DecorationSet>()
const inlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) if (e.is(setInlays)) value = e.value
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Fetches inlay hints for the viewport (debounced) and pushes them into the
// field. A no-op when the server has no inlayHintProvider (request rejects).
const inlayFetcher = ViewPlugin.fromClass(
  class {
    pending = -1
    constructor(view: EditorView) {
      this.schedule(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.schedule(u.view)
    }
    schedule(view: EditorView) {
      if (this.pending > -1) clearTimeout(this.pending)
      this.pending = window.setTimeout(() => {
        this.pending = -1
        this.fetch(view)
      }, 400)
    }
    fetch(view: EditorView) {
      const plugin = LSPPlugin.get(view)
      if (!plugin) return
      const { from, to } = view.viewport
      plugin.client
        .request<unknown, InlayHint[] | null>("textDocument/inlayHint", {
          textDocument: { uri: plugin.uri },
          range: { start: plugin.toPosition(from), end: plugin.toPosition(to) },
        })
        .then((hints) => {
          if (!hints) return
          const items = hints
            .map((h) => ({ pos: plugin.fromPosition(h.position), h }))
            .sort((a, b) => a.pos - b.pos)
          const b = new RangeSetBuilder<Decoration>()
          for (const { pos, h } of items) {
            const label =
              typeof h.label === "string" ? h.label : h.label.map((p) => p.value).join("")
            b.add(
              pos,
              pos,
              Decoration.widget({
                widget: new InlayWidget(label, !!h.paddingLeft, !!h.paddingRight),
                side: 1,
              }),
            )
          }
          view.dispatch({ effects: setInlays.of(b.finish()) })
        })
        .catch(() => {})
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending)
    }
  },
)

export const inlayHints = (): Extension => [inlayField, inlayFetcher]
