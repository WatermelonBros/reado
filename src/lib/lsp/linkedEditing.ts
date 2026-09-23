import { LSPPlugin } from "@codemirror/lsp-client"
import {
  EditorState,
  type Extension,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import { safeError } from "@/lib/logger"
import { type LspPos, log, type ServerCaps } from "./shared"

// ---- Linked editing ---------------------------------------------------------

/** The ranges the server says must stay identical, and the document they were
 *  computed against. */
const setLinked = StateEffect.define<{ from: number; to: number }[] | null>()

const linkedRanges = StateField.define<{ from: number; to: number }[] | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLinked)) return e.value
    if (!value) return null
    // Mapped through edits so a mirrored change keeps the partner correct; a
    // change that is not inside one of the ranges drops the link (`mirrorLinked`
    // is what decides that, before this runs).
    return value.map((r) => ({
      from: tr.changes.mapPos(r.from, 1),
      to: tr.changes.mapPos(r.to, -1),
    }))
  },
  provide: (f) =>
    EditorView.decorations.from(f, (ranges) =>
      ranges?.length
        ? Decoration.set(
            ranges.map((r) => Decoration.mark({ class: "cm-linked-range" }).range(r.from, r.to)),
            true,
          )
        : Decoration.none,
    ),
})

/** Ask where the cursor's linked ranges are, when the cursor has moved out of
 *  the ones we hold. */
const linkedFetcher = ViewPlugin.fromClass(
  class {
    pending = -1
    update(u: ViewUpdate) {
      if (!u.selectionSet && !u.docChanged) return
      const held = u.state.field(linkedRanges, false)
      const head = u.state.selection.main.head
      if (held?.some((r) => head >= r.from && head <= r.to)) return
      if (this.pending > -1) clearTimeout(this.pending)
      this.pending = window.setTimeout(() => {
        this.pending = -1
        this.fetch(u.view)
      }, 150)
    }
    fetch(view: EditorView) {
      const plugin = LSPPlugin.get(view)
      const caps = plugin?.client.serverCapabilities as ServerCaps | undefined
      if (!plugin || !caps?.linkedEditingRangeProvider) return
      const held = view.state.field(linkedRanges, false)
      const before = view.state.doc
      const head = view.state.selection.main.head
      plugin.client.sync()
      plugin.client
        .request<object, { ranges: Array<{ start: LspPos; end: LspPos }> } | null>(
          "textDocument/linkedEditingRange",
          { textDocument: { uri: plugin.uri }, position: plugin.toPosition(head) },
        )
        .then((res) => {
          if (view.state.doc !== before) return
          const ranges =
            res?.ranges.map((r) => ({
              from: plugin.fromPosition(r.start),
              to: plugin.fromPosition(r.end),
            })) ?? null
          if (!ranges && !held) return
          view.dispatch({ effects: setLinked.of(ranges?.length ? ranges : null) })
        })
        .catch((e) => log.warn("linkedEditingRange failed", { error: safeError(e) }))
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending)
    }
  },
)

/**
 * Apply an edit made inside one linked range to the others, in the same
 * transaction — so the pair can never half-change, and one undo takes back both.
 *
 * An edit that leaves the range (a paste over its end, a selection spanning it)
 * mirrors nothing and drops the link: the server's answer described text that is
 * no longer there.
 */
const mirrorLinked = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(Transaction.remote)) return tr
  const ranges = tr.startState.field(linkedRanges, false)
  if (!ranges || ranges.length < 2) return tr
  const edits: Array<{ from: number; to: number; insert: string }> = []
  let inside: { from: number; to: number } | null = null
  let escaped = false
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const home = ranges.find((r) => fromA >= r.from && toA <= r.to)
    if (!home || (inside && inside !== home)) {
      escaped = true
      return
    }
    inside = home
    for (const other of ranges) {
      if (other === home) continue
      // Mapped through this transaction: the mirrored change is applied to the
      // document the transaction *produces*, where everything after the edit has
      // already moved.
      edits.push({
        from: tr.changes.mapPos(other.from + (fromA - home.from), 1),
        to: tr.changes.mapPos(other.from + (toA - home.from), 1),
        insert: inserted.toString(),
      })
    }
  })
  if (escaped) return [tr, { effects: setLinked.of(null) }]
  if (!edits.length) return tr
  return [tr, { changes: edits, sequential: true }]
})

export const linkedEditing = (): Extension => [linkedRanges, linkedFetcher, mirrorLinked]
