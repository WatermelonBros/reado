// Accepting a completion for a symbol this file never imported has to bring the
// import with it. The edit that does that exists only after the client asks the
// server to resolve the item, which is the part that was missing.
import {
  autocompletion,
  type CompletionSource,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { describe, expect, it, vi } from "vitest"
import { applyCompletion, type LspCompletionItem } from "@/lib/lsp"

const DOC = "export function X() {\n  const v = useSta\n}\n"

/** The plugin's surface as `applyCompletion` uses it, over a real document. */
function plugin(request: ReturnType<typeof vi.fn>) {
  return {
    uri: "file:///x.tsx",
    // The resolve round trip is gated on the capability: a server that never
    // advertised `resolveProvider` used to be asked anyway, and answered
    // "Method not implemented" on its own stderr, once per item.
    client: { request, serverCapabilities: { completionProvider: { resolveProvider: true } } },
    fromPosition: (p: { line: number; character: number }, doc: EditorState["doc"]) =>
      doc.line(p.line + 1).from + p.character,
  } as never
}

/** The import edit a TypeScript server returns for `useState`. */
const IMPORT_EDIT = {
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  newText: 'import { useState } from "react"\n',
}

const mount = () => {
  const view = new EditorView({ state: EditorState.create({ doc: DOC }), parent: document.body })
  return view
}
/** Where "useSta" sits in the document. */
const WORD = { from: DOC.indexOf("useSta"), to: DOC.indexOf("useSta") + 6 }

describe("a server that never offered to resolve", () => {
  it('is not asked, so it cannot answer "Method not implemented"', async () => {
    const request = vi.fn()
    const view = mount()
    const noResolve = {
      uri: "file:///x.tsx",
      client: { request, serverCapabilities: { completionProvider: {} } },
      fromPosition: (p: { line: number; character: number }, doc: EditorState["doc"]) =>
        doc.line(p.line + 1).from + p.character,
    } as never
    applyCompletion(
      noResolve,
      view,
      { label: "useState", data: { entryName: "useState" } },
      WORD.from,
      WORD.to,
    )
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()
    view.destroy()
  })
})

describe("the completion source the server contributes", () => {
  it("is one function, not a fresh one per lookup", async () => {
    // CodeMirror matches a finished query back to the source that started it by
    // *identity*. A provider that builds a new function each time it is asked
    // can never have an answer accepted: every result belongs to a source that
    // no longer exists, so the completion sits in "pending" forever and the
    // popup shows everything except what the language server said. That is
    // exactly what happened — the server replied in 17ms and nothing appeared.
    const { completionWithImports } = await import("@/lib/lsp")
    const state = EditorState.create({ doc: "x", extensions: completionWithImports() })
    const first = state.languageDataAt<unknown>("autocomplete", 0)
    const second = state.languageDataAt<unknown>("autocomplete", 0)
    expect(first).toHaveLength(1)
    expect(first[0]).toBe(second[0])
  })

  it("survives being asked from two different states", async () => {
    // The same extension is instantiated per editor; the source must still be
    // the one object, or two panes on one file behave differently.
    const { completionWithImports } = await import("@/lib/lsp")
    const ext = completionWithImports()
    const a = EditorState.create({ doc: "a", extensions: ext })
    const b = EditorState.create({ doc: "b", extensions: ext })
    expect(a.languageDataAt<unknown>("autocomplete", 0)[0]).toBe(
      b.languageDataAt<unknown>("autocomplete", 0)[0],
    )
  })
})

describe("a source's identity, as CodeMirror uses it", () => {
  /** Run a completion through the real popup machinery and report its status. */
  async function statusWith(provider: () => readonly { autocomplete: CompletionSource }[]) {
    const view = new EditorView({
      state: EditorState.create({
        doc: "alpha\nal",
        extensions: [autocompletion(), EditorState.languageData.of(provider)],
      }),
      parent: document.body,
    })
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    startCompletion(view)
    await new Promise((r) => setTimeout(r, 250))
    const status = completionStatus(view.state)
    view.destroy()
    return status
  }

  /** An async source, like one that asks a language server. */
  const answer: CompletionSource = async () => {
    await Promise.resolve()
    return { from: 6, options: [{ label: "alpha" }] }
  }

  it("accepts the answer when the source is the same object each time", async () => {
    const stable = [{ autocomplete: answer }]
    expect(await statusWith(() => stable)).toBe("active")
  })

  it("never accepts it when the provider mints a new function each lookup", async () => {
    // The failure this file exists for: the source answers, and the answer is
    // discarded because it belongs to a function that no longer exists.
    expect(await statusWith(() => [{ autocomplete: (c) => answer(c) }])).toBe("pending")
  })
})

describe("accepting a server completion", () => {
  it("asks the server to resolve the item, and applies the import it answers with", async () => {
    const request = vi.fn(async () => ({ additionalTextEdits: [IMPORT_EDIT] }))
    const view = mount()
    const item: LspCompletionItem = { label: "useState", data: { autoImport: true } }

    applyCompletion(plugin(request), view, item, WORD.from, WORD.to)
    // The name lands immediately — typing never waits on the network.
    expect(view.state.doc.toString()).toContain("const v = useState")
    expect(request).toHaveBeenCalledWith("completionItem/resolve", item)

    await vi.waitFor(() =>
      expect(view.state.doc.toString()).toContain('import { useState } from "react"'),
    )
    view.destroy()
  })

  it("applies edits the item already carried, without a round trip", () => {
    const request = vi.fn()
    const view = mount()
    applyCompletion(
      plugin(request),
      view,
      { label: "useState", additionalTextEdits: [IMPORT_EDIT] },
      WORD.from,
      WORD.to,
    )
    expect(view.state.doc.toString()).toContain('import { useState } from "react"')
    expect(request).not.toHaveBeenCalled()
    view.destroy()
  })

  it("resolves nothing for an item that has nothing to resolve", () => {
    const request = vi.fn()
    const view = mount()
    applyCompletion(plugin(request), view, { label: "value" }, WORD.from, WORD.to)
    expect(request).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toContain("const v = value")
    view.destroy()
  })

  it("drops an edit that no longer fits the document instead of throwing", async () => {
    const request = vi.fn(async () => ({
      additionalTextEdits: [
        {
          range: { start: { line: 99, character: 0 }, end: { line: 99, character: 0 } },
          newText: "x",
        },
      ],
    }))
    const view = mount()
    applyCompletion(plugin(request), view, { label: "useState", data: {} }, WORD.from, WORD.to)
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
    expect(view.state.doc.toString()).toContain("useState")
    view.destroy()
  })
})
