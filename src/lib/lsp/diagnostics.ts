import { type Diagnostic, setDiagnostics } from "@codemirror/lint"
import { type LSPClient, LSPPlugin } from "@codemirror/lsp-client"
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import { t } from "@/i18n"
import { useDiagnostics } from "@/lib/diagnostics"
import { taskFromDiagnostic } from "@/lib/lspActions"
import {
  diagRefreshers,
  fromUri,
  type LspDiag,
  log,
  readyPlugin,
  type ServerMessage,
} from "./shared"

/** Tap `publishDiagnostics` to surface per-file error counts outside the editor
 * (red filenames in the tree). The CodeMirror client still renders them; this
 * just mirrors the error count into the store — through `storeDiagnostics`, the
 * same door the pull path uses, so push and pull can never disagree. */
export function tapDiagnostics(msg: ServerMessage): void {
  const params = msg.params as PublishParams | undefined
  if (msg.method !== "textDocument/publishDiagnostics" || !params) return
  storeDiagnostics(params.uri, params.diagnostics)
}

// ---- Diagnostics + sync (replacing the library's bundled `serverDiagnostics`,
// which we can't extend with an action) ------------------------------------

interface PublishParams {
  uri: string
  version?: number
  diagnostics: LspDiag[]
}

const toSeverity = (sev: number): Diagnostic["severity"] =>
  sev === 1 ? "error" : sev === 2 ? "warning" : sev === 4 ? "hint" : "info"

// The library's `autoSync` (which pushes `didChange` after edits) isn't
// exported, so we reimplement it: debounce doc changes, then flush via the
// public `LSPClient.sync()`.
const autoSync = ViewPlugin.fromClass(
  class {
    pending = -1
    update(u: ViewUpdate) {
      if (!u.docChanged) return
      if (this.pending > -1) clearTimeout(this.pending)
      this.pending = window.setTimeout(() => {
        this.pending = -1
        LSPPlugin.get(u.view)?.client.sync()
      }, 500)
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending)
    }
  },
)

/** Paint one file's diagnostics into its editor as lint markers, each carrying
 *  the "Create task" action. Shared by the push notification and the pull
 *  request — the two ways a server has of telling us the same thing. */
function renderDiagnostics(view: EditorView, plugin: LSPPlugin, diags: LspDiag[]): void {
  view.dispatch(
    setDiagnostics(
      view.state,
      diags.map((item): Diagnostic => {
        const from = plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(item.range.start, plugin.syncedDoc),
        )
        const to = plugin.unsyncedChanges.mapPos(
          plugin.fromPosition(item.range.end, plugin.syncedDoc),
        )
        return {
          from,
          to,
          severity: toSeverity(item.severity ?? 1),
          message: item.message,
          actions: [
            {
              name: t("lsp.createTask"),
              apply: (v, f, tt) =>
                v.dispatch({
                  effects: taskFromDiagnostic.of({ from: f, to: tt, message: item.message }),
                }),
            },
          ],
        }
      }),
    ),
  )
}

/** Mirror one file's diagnostics into the store the tree and the Problems panel
 *  read — the counts that live outside the editor. */
function storeDiagnostics(uri: string, diags: LspDiag[]): void {
  useDiagnostics.getState().setFileDiagnostics(
    fromUri(uri),
    diags.map((d) => ({
      line: (d.range?.start?.line ?? 0) + 1,
      character: d.range?.start?.character ?? 0,
      severity: d.severity ?? 1,
      message: d.message ?? "",
    })),
  )
}

/** One document's answer to `textDocument/diagnostic`. `unchanged` means "the
 *  same as the result id you sent me", which is why the id has to be kept. */
interface DiagnosticReport {
  kind?: "full" | "unchanged"
  resultId?: string
  items?: LspDiag[]
  /** Problems the server found in *other* files while checking this one — what
   *  `interFileDependencies` means. Keyed by URI. */
  relatedDocuments?: Record<string, DiagnosticReport>
}

/**
 * Pull diagnostics (`textDocument/diagnostic`).
 *
 * A server either pushes diagnostics at us or waits to be asked, and it says
 * which in `diagnosticProvider`. TypeScript 7 — `tsc --lsp`, which is what a
 * project on TS 7 gets — only waits. Reado used to only listen, and the client
 * library advertises pull support on our behalf, so the server stayed politely
 * silent and no TypeScript error ever reached the editor or the Problems panel.
 *
 * Asked on open, after an edit settles, and after a save, because those are the
 * three moments the answer can have changed.
 */

const pullDiagnostics = ViewPlugin.fromClass(
  class {
    pending = -1
    /** Last result id per URI, so the server can answer "unchanged". */
    resultIds = new Map<string, string>()
    /** Dropped when the view goes away, so a late answer can't paint a dead editor. */
    gone = false

    constructor(readonly view: EditorView) {
      this.schedule(0)
      diagRefreshers.add(this.again)
    }

    /** "The server's answer changed" — re-ask, shortly, and only if this view
     *  still pulls at all. */
    again = () => {
      if (!this.off) this.schedule(120)
    }

    update(u: ViewUpdate) {
      if (u.docChanged && !this.off) this.schedule(600)
    }

    schedule(delay: number) {
      if (this.pending > -1) clearTimeout(this.pending)
      this.pending = window.setTimeout(() => {
        this.pending = -1
        void this.pull()
      }, delay)
    }

    /** Set once the server has said it does not answer pull requests, so a
     *  push-only server stops arming a timer on every keystroke. */
    off = false

    async pull() {
      if (this.gone || this.off) return
      // The editor exists before the server has answered `initialize`; wait for
      // the answer rather than giving up, because giving up is how a file ends
      // up with no diagnostics until the user happens to type in it.
      const plugin = await readyPlugin(this.view)
      if (!plugin || this.gone) return
      if (!plugin.client.serverCapabilities?.diagnosticProvider) {
        this.off = true
        return
      }
      // The server answers about the document it has, so give it the current one
      // first — otherwise every diagnostic is one edit stale.
      plugin.client.sync()
      const uri = plugin.uri
      try {
        const res = await plugin.client.request<object, DiagnosticReport | null>(
          "textDocument/diagnostic",
          {
            textDocument: { uri },
            ...(this.resultIds.has(uri) ? { previousResultId: this.resultIds.get(uri) } : {}),
          },
        )
        if (!res || this.gone) return
        this.apply(uri, res, plugin)
        for (const [related, report] of Object.entries(res.relatedDocuments ?? {})) {
          // Another file's problems: they belong in the Problems panel even
          // though no editor here is showing them.
          if (report.kind !== "unchanged" && report.items) storeDiagnostics(related, report.items)
        }
      } catch (e) {
        log.warn("pull diagnostics failed", { error: String(e) })
      }
    }

    apply(uri: string, res: DiagnosticReport, plugin: LSPPlugin) {
      if (res.resultId) this.resultIds.set(uri, res.resultId)
      // "unchanged" means keep what is on screen, not clear it.
      if (res.kind === "unchanged") return
      const items = res.items ?? []
      renderDiagnostics(this.view, plugin, items)
      storeDiagnostics(uri, items)
    }

    destroy() {
      this.gone = true
      diagRefreshers.delete(this.again)
      if (this.pending > -1) clearTimeout(this.pending)
    }
  },
)

/**
 * A buffer was just written to disk.
 *
 * A save is the one moment a file changes without a keystroke: formatters and
 * codegen run there, and a server that only answers when it is asked has no
 * other way to find out. Called from every path that writes an open buffer.
 */
export function fileSaved(view: EditorView): void {
  view.plugin(pullDiagnostics)?.schedule(0)
}

/** Our `serverDiagnostics`: renders server diagnostics as lint markers (as the
 * library does) but adds a "Create task" action so the user can turn a problem
 * into an anchored task comment straight from the tooltip. Push and pull both
 * land here; a server uses one or the other, never both. */
export function serverDiagnostics() {
  return {
    clientCapabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    notificationHandlers: {
      "textDocument/publishDiagnostics": (client: LSPClient, params: PublishParams) => {
        const file = client.workspace.getFile(params.uri)
        if (!file || (params.version != null && params.version !== file.version)) return false
        const view = file.getView()
        const plugin = view && LSPPlugin.get(view)
        if (!view || !plugin) return false
        renderDiagnostics(view, plugin, params.diagnostics)
        return true
      },
    },
    editorExtension: [autoSync, pullDiagnostics],
  }
}
