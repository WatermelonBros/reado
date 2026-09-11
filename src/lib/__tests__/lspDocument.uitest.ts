// The whole-document language-server features: folding ranges, document links
// and linked editing. Each is driven through a real editor over a fake server,
// because each one's contract is "what the editor does with the answer".
import { history, undo } from "@codemirror/commands"
import { foldable } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  plugin: null as null | {
    uri: string
    client: {
      sync: () => void
      request: ReturnType<typeof vi.fn>
      serverCapabilities?: Record<string, unknown>
    }
    toPosition: (pos: number) => { line: number; character: number }
    fromPosition: (p: { line: number; character: number }) => number
  },
}))

vi.mock("@codemirror/lsp-client", () => ({
  LSPPlugin: { get: () => h.plugin, create: vi.fn() },
  LSPClient: class {},
  formatKeymap: [],
  renameKeymap: [],
  serverCompletion: () => [],
  signatureHelp: () => [],
}))

const open = vi.fn()
const openPane = vi.fn()
vi.mock("@/lib/store", async (orig) => {
  const actual = await orig<typeof import("@/lib/store")>()
  return {
    ...actual,
    useProject: {
      ...actual.useProject,
      getState: () => ({ ...actual.useProject.getState(), open }),
    },
  }
})
vi.mock("@/lib/preview", () => ({ usePreview: { getState: () => ({ openPane }) } }))
const notify = vi.fn()
vi.mock("@/lib/notice", () => ({ notify: (...a: unknown[]) => notify(...a) }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import {
  documentLinkAt,
  documentLinks,
  linkedEditing,
  lspFolding,
  openDocumentLink,
} from "@/lib/lsp"

let view: EditorView | undefined

/** A document whose server answers `res`, with the extension under test. */
function editor(
  doc: string,
  extension: ReturnType<typeof lspFolding>,
  caps: Record<string, unknown>,
  res: unknown,
) {
  const request = vi.fn(async () => res)
  h.plugin = {
    uri: "file:///repo/src/a.ts",
    client: { sync: vi.fn(), request, serverCapabilities: caps },
    // One line per position, so offsets and LSP positions are easy to read here.
    toPosition: (pos: number) => ({ line: 0, character: pos }),
    fromPosition: (p: { line: number; character: number }) => p.character,
  }
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [extension] }),
    parent: document.body,
  })
  return { request, view }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  view?.destroy()
  view = undefined
})

/** Let the debounced fetch fire and its promise settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(500)
}

describe("folding ranges", () => {
  const doc = "import a\nimport b\nimport c\ncode()\n"

  it("folds a region the syntax tree has no node for", async () => {
    const { request } = editor(doc, lspFolding(), { foldingRangeProvider: true }, [
      { startLine: 0, endLine: 2 },
    ])
    await settle()
    expect(request).toHaveBeenCalledWith("textDocument/foldingRange", expect.any(Object))
    const v = view as EditorView
    const line = v.state.doc.line(1)
    expect(foldable(v.state, line.from, line.to)).toEqual({ from: line.to, to: 26 })
  })

  it("says nothing about a line the server did not report", async () => {
    editor(doc, lspFolding(), { foldingRangeProvider: true }, [{ startLine: 0, endLine: 2 }])
    await settle()
    const v = view as EditorView
    const line = v.state.doc.line(4)
    expect(foldable(v.state, line.from, line.to)).toBeNull()
  })

  it("does not ask a server that does not offer folding", async () => {
    const { request } = editor(doc, lspFolding(), {}, [])
    await settle()
    expect(request).not.toHaveBeenCalled()
  })

  it("drops the answer as soon as the document changes", async () => {
    editor(doc, lspFolding(), { foldingRangeProvider: true }, [{ startLine: 0, endLine: 2 }])
    await settle()
    const v = view as EditorView
    v.dispatch({ changes: { from: 0, insert: "x" } })
    const line = v.state.doc.line(1)
    // Offsets computed against the old text would fold the wrong region.
    expect(foldable(v.state, line.from, line.to)).toBeNull()
  })
})

describe("document links", () => {
  const doc = `{"extends": "../base.json"}`
  const linkRange = { start: { line: 0, character: 12 }, end: { line: 0, character: 25 } }

  it("finds the link under a position and opens a file target in the editor", async () => {
    editor(doc, documentLinks(), { documentLinkProvider: {} }, [
      { range: linkRange, target: "file:///repo/base.json" },
    ])
    await settle()
    const v = view as EditorView
    const found = documentLinkAt(v, 15)
    expect(found).toMatchObject({ from: 12, to: 25 })
    expect(documentLinkAt(v, 2)).toBeNull()

    await openDocumentLink(v, (found as NonNullable<typeof found>).link)
    expect(open).toHaveBeenCalledWith("/repo/base.json", undefined)
  })

  it("opens a web target in the browser pane", async () => {
    editor(doc, documentLinks(), { documentLinkProvider: {} }, [
      { range: linkRange, target: "https://example.com/schema" },
    ])
    await settle()
    await openDocumentLink(view as EditorView, {
      range: linkRange,
      target: "https://example.com/schema",
    })
    expect(openPane).toHaveBeenCalledWith("https://example.com/schema")
  })

  it("resolves a link that has no target, at the moment it is used", async () => {
    const { request } = editor(
      doc,
      documentLinks(),
      { documentLinkProvider: { resolveProvider: true } },
      [{ range: linkRange }],
    )
    await settle()
    const v = view as EditorView
    const found = documentLinkAt(v, 15)
    request.mockResolvedValueOnce({ range: linkRange, target: "file:///repo/base.json" })
    await openDocumentLink(v, (found as NonNullable<typeof found>).link)
    expect(request).toHaveBeenLastCalledWith("documentLink/resolve", expect.any(Object))
    expect(open).toHaveBeenCalledWith("/repo/base.json", undefined)
  })

  it("says so when a target cannot be opened, rather than doing nothing", async () => {
    editor(doc, documentLinks(), { documentLinkProvider: {} }, [])
    await settle()
    await openDocumentLink(view as EditorView, { range: linkRange, target: "mailto:a@b.com" })
    expect(notify).toHaveBeenCalledWith("info", "lsp.linkUnopenable")
  })
})

describe("linked editing", () => {
  const doc = "<div></div>"
  //           01234  6789
  const ranges = {
    ranges: [
      { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } },
      { start: { line: 0, character: 7 }, end: { line: 0, character: 10 } },
    ],
  }

  it("applies an edit in one range to the other, in one transaction", async () => {
    editor(doc, linkedEditing(), { linkedEditingRangeProvider: true }, ranges)
    const v = view as EditorView
    // The fetch is driven by the cursor moving into a linked range.
    v.dispatch({ selection: { anchor: 2 } })
    await settle()
    v.dispatch({ changes: { from: 4, insert: "x" } })
    expect(v.state.doc.toString()).toBe("<divx></divx>")
  })

  it("takes both halves back in one undo", async () => {
    editor(doc, [linkedEditing(), history()] as never, { linkedEditingRangeProvider: true }, ranges)
    const v = view as EditorView
    v.dispatch({ selection: { anchor: 2 } })
    await settle()
    v.dispatch({ changes: { from: 4, insert: "x" }, userEvent: "input.type" })
    expect(v.state.doc.toString()).toBe("<divx></divx>")
    undo(v)
    expect(v.state.doc.toString()).toBe(doc)
  })

  it("mirrors nothing when the edit leaves the range", async () => {
    editor(doc, linkedEditing(), { linkedEditingRangeProvider: true }, ranges)
    const v = view as EditorView
    v.dispatch({ selection: { anchor: 2 } })
    await settle()
    // From inside the tag name out past its end: `iv><` becomes `p`, and the
    // closing tag is left exactly as it was.
    v.dispatch({ changes: { from: 2, to: 6, insert: "p" } })
    expect(v.state.doc.toString()).toBe("<dp/div>")
  })

  it("does not ask a server that does not offer it", async () => {
    const { request } = editor(doc, linkedEditing(), {}, ranges)
    const v = view as EditorView
    v.dispatch({ selection: { anchor: 2 } })
    await settle()
    expect(request).not.toHaveBeenCalled()
  })
})
