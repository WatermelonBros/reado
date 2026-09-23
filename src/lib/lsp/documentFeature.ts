import { foldService } from "@codemirror/language"
import { type LSPClient, LSPPlugin } from "@codemirror/lsp-client"
import { type Extension, StateEffect, StateField } from "@codemirror/state"
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import { t } from "@/i18n"
import { safeError } from "@/lib/logger"
import { notify } from "@/lib/notice"
import { usePreview } from "@/lib/preview"
import { useProject } from "@/lib/store"
import { fromUri, type LspPos, log, type ServerCaps } from "./shared"

// ---- Whole-document answers (folding ranges, links) -------------------------

/**
 * A list the server computes for the whole document, refreshed when the document
 * changes.
 *
 * Two features want the same shape: ask once per document version, hold the
 * answer, throw it away the moment an edit makes its offsets wrong. `null` means
 * "nothing to use yet" — never "the server said no" — so every reader falls back
 * to what Reado does without a server instead of waiting.
 */
export function documentFeature<T>(
  method: string,
  supported: (caps: ServerCaps) => boolean,
  /** Turn the server's raw list into the one to store — for the features whose
   *  items arrive incomplete and need a second round trip each (code lenses come
   *  back with no title from every server that sets `resolveProvider`). */
  refine?: (items: T[], client: LSPClient) => Promise<T[]>,
) {
  const set = StateEffect.define<T[] | null>()
  const field = StateField.define<T[] | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(set)) return e.value
      // An edit invalidates every offset computed against the old text.
      return tr.docChanged ? null : value
    },
  })
  const fetcher = ViewPlugin.fromClass(
    class {
      pending = -1
      /** Whether we have already parked a retry on the handshake (see `fetch`). */
      waitingForHandshake = false
      constructor(view: EditorView) {
        this.schedule(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.schedule(u.view)
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
        // The one scheduled fetch can land before `initialize` comes back, and
        // capabilities arrive *with* that answer. Without waiting for it the
        // request is skipped as "unsupported" and nothing ever asks again —
        // opening a file and not typing in it meant no lenses, no server
        // folding, no document links, ever. Parked once, so a server that comes
        // back with nothing can't put us in a loop.
        if (!plugin.client.serverCapabilities) {
          if (this.waitingForHandshake) return
          this.waitingForHandshake = true
          plugin.client.initializing.then(
            () => this.schedule(view),
            () => {},
          )
          return
        }
        if (!supported(plugin.client.serverCapabilities as ServerCaps)) return
        const before = view.state.doc
        plugin.client.sync()
        plugin.client
          .request<object, T[] | null>(method, { textDocument: { uri: plugin.uri } })
          .then((res) => (refine && res?.length ? refine(res, plugin.client) : (res ?? [])))
          .then((res) => {
            // The user edited while the server thought: these offsets describe a
            // document that no longer exists.
            if (view.state.doc !== before) return
            view.dispatch({ effects: set.of(res) })
          })
          .catch((e) => log.warn(`${method} failed`, { error: safeError(e) }))
      }
      destroy() {
        if (this.pending > -1) clearTimeout(this.pending)
      }
    },
  )
  /** Ask again for a view that already has this feature — the server saying its
   *  answer changed, rather than the document changing under it. */
  const refetch = (view: EditorView) => view.plugin(fetcher)?.schedule(view)
  return { field, refetch, extension: [field, fetcher] as Extension }
}

// ---- Folding ranges ---------------------------------------------------------

/** An LSP `FoldingRange`. Lines are 0-based; the characters are optional. */
interface FoldingRange {
  startLine: number
  startCharacter?: number
  endLine: number
  endCharacter?: number
  kind?: string
}

const folding = documentFeature<FoldingRange>(
  "textDocument/foldingRange",
  (caps) => !!caps?.foldingRangeProvider,
)

/**
 * Folding by what the server knows, with the syntax tree as the floor.
 *
 * The syntax folder knows nodes: a function body folds, a block of imports or a
 * `#region` does not, because neither is one node. Returning null for a line the
 * server says nothing about leaves those to the folder that was already there,
 * so this can only add.
 */
export const lspFolding = (): Extension => [
  folding.extension,
  foldService.of((state, lineStart, lineEnd) => {
    const ranges = state.field(folding.field, false)
    if (!ranges?.length) return null
    const line = state.doc.lineAt(lineStart)
    const match = ranges.find((r) => r.startLine === line.number - 1 && r.endLine > r.startLine)
    if (!match) return null
    const endLine = state.doc.line(Math.min(match.endLine + 1, state.doc.lines))
    const from = match.startCharacter != null ? line.from + match.startCharacter : lineEnd
    const to = match.endCharacter != null ? endLine.from + match.endCharacter : endLine.to
    return to > from ? { from, to } : null
  }),
]

// ---- Document links ---------------------------------------------------------

/** An LSP `DocumentLink`. `target` may be absent until resolved. */
export interface DocumentLink {
  range: { start: LspPos; end: LspPos }
  target?: string
  tooltip?: string
  data?: unknown
}

const links = documentFeature<DocumentLink>(
  "textDocument/documentLink",
  (caps) => !!caps?.documentLinkProvider,
)

export const documentLinks = (): Extension => links.extension

/** The server-reported link covering `pos`, as document offsets. */
export function documentLinkAt(
  view: EditorView,
  pos: number,
): { from: number; to: number; link: DocumentLink } | null {
  const all = view.state.field(links.field, false)
  const plugin = LSPPlugin.get(view)
  if (!all?.length || !plugin) return null
  for (const link of all) {
    const from = plugin.fromPosition(link.range.start)
    const to = plugin.fromPosition(link.range.end)
    if (pos >= from && pos <= to) return { from, to, link }
  }
  return null
}

/**
 * Follow a document link: a file in the editor, a web address in the browser
 * pane. A link the server has not resolved is resolved now — at the moment it is
 * used, not for every link in the file on the chance one is clicked.
 */
export async function openDocumentLink(view: EditorView, link: DocumentLink): Promise<boolean> {
  const plugin = LSPPlugin.get(view)
  let target = link.target
  if (!target && plugin) {
    try {
      const resolved = await plugin.client.request<DocumentLink, DocumentLink | null>(
        "documentLink/resolve",
        link,
      )
      target = resolved?.target
    } catch (e) {
      log.warn("documentLink/resolve failed", { error: safeError(e) })
    }
  }
  if (!target) {
    notify("info", t("lsp.linkUnresolved"))
    return false
  }
  if (target.startsWith("file:")) {
    // `#L12` / `#12` — the line, when the server names one.
    const [uri, fragment] = target.split("#")
    const line = fragment ? Number(fragment.replace(/^L/, "")) : Number.NaN
    useProject.getState().open(fromUri(uri), Number.isFinite(line) ? line : undefined)
    return true
  }
  if (/^https?:/.test(target)) {
    usePreview.getState().openPane(target)
    return true
  }
  notify("info", t("lsp.linkUnopenable", { target }))
  return false
}
