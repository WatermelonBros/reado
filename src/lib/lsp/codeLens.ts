import { type LSPClient, LSPPlugin } from "@codemirror/lsp-client"
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view"
import { t } from "@/i18n"
import { lspSend } from "@/lib/api"
import { safeError } from "@/lib/logger"
import { showLensLocations } from "@/lib/lspActions"
import { notify } from "@/lib/notice"
import { useProject, useSettings } from "@/lib/store"
import { documentFeature } from "./documentFeature"
import {
  conns,
  fromUri,
  type LspLocation,
  type LspPos,
  lensRefreshers,
  log,
  type ServerCaps,
} from "./shared"

// ---- Code lenses ------------------------------------------------------------

/** An LSP `Command` — what a lens does when it is clicked. */
interface LspCommand {
  title: string
  command: string
  arguments?: unknown[]
}

/** An LSP `CodeLens`. `command` is absent until resolved; `data` is the server's
 *  own handle for resolving it, and is passed back untouched. */
interface CodeLens {
  range: { start: LspPos; end: LspPos }
  command?: LspCommand
  data?: unknown
}

/** How many lenses one document is allowed to resolve. A resolve is a round trip
 *  per lens; a 5000-line file with a lens on every symbol would spend the
 *  server's attention on lines nobody is looking at. */
const MAX_LENSES = 200

/** Lenses arrive titleless from every server that sets `resolveProvider` — the
 *  count *is* the expensive part, so it is computed only for the lenses someone
 *  asked for. A lens that fails to resolve is dropped, not shown blank.
 *
 *  A server that advertises `codeLensProvider` without `resolveProvider` promised
 *  the list and not the resolution: asking anyway earned a "Method not
 *  implemented" per lens — up to `MAX_LENSES` of them — and the JSON and CSS
 *  servers print that on their own stderr, so the `.catch` below could not keep
 *  it out of the log. Its lenses arrive complete or not at all. */
async function resolveLenses(items: CodeLens[], client: LSPClient): Promise<CodeLens[]> {
  const caps = client.serverCapabilities as ServerCaps | undefined
  if (!caps?.codeLensProvider?.resolveProvider) {
    return items.slice(0, MAX_LENSES).filter((l) => !!l.command?.title)
  }
  const wanted = items.slice(0, MAX_LENSES)
  const resolved = await Promise.all(
    wanted.map((lens) =>
      lens.command
        ? Promise.resolve(lens)
        : client
            .request<CodeLens, CodeLens | null>("codeLens/resolve", lens)
            // The resolved lens replaces the original, but its range is ours to
            // keep: it is what the row is drawn at, and a server that answers
            // with only a command must not cost us the line it belongs to.
            .then((res) => (res ? { ...lens, ...res } : null))
            .catch(() => null as CodeLens | null),
    ),
  )
  return resolved.filter((l): l is CodeLens => !!l?.command?.title)
}

const lenses = documentFeature<CodeLens>(
  "textDocument/codeLens",
  // The setting gates the request itself: off means the server is never asked.
  (caps) => useSettings.getState().codeLens && !!caps?.codeLensProvider,
  resolveLenses,
)

/** The offset a `line`/`character` pair names, clamped to the document — the
 *  server's idea of the document can be one keystroke behind ours. */
function offsetOf(doc: EditorState["doc"], pos: LspPos): number {
  const line = doc.line(Math.min(Math.max(pos.line + 1, 1), doc.lines))
  return Math.min(line.from + pos.character, line.to)
}

/** One row of lenses, drawn above the line they describe. */
class LensWidget extends WidgetType {
  constructor(
    readonly items: CodeLens[],
    readonly indent: number,
  ) {
    super()
  }
  eq(o: LensWidget) {
    return (
      o.indent === this.indent &&
      o.items.length === this.items.length &&
      o.items.every((l, i) => l.command?.title === this.items[i].command?.title)
    )
  }
  toDOM(view: EditorView) {
    const row = document.createElement("div")
    row.className = "cm-codelens"
    row.style.paddingLeft = `${this.indent}ch`
    this.items.forEach((lens, i) => {
      if (i > 0) {
        const sep = document.createElement("span")
        sep.className = "cm-codelens-sep"
        sep.textContent = "·"
        row.appendChild(sep)
      }
      const b = document.createElement("button")
      b.type = "button"
      b.className = "cm-codelens-item"
      b.textContent = lens.command?.title ?? ""
      b.onclick = (e) => void runLens(view, lens, e)
      row.appendChild(b)
    })
    return row
  }
  /** The row is chrome, not text: clicks belong to its buttons, not the editor. */
  ignoreEvent() {
    return true
  }
}

/** Group the document's lenses by line and turn each group into one row above it. */
function lensDecorations(state: EditorState): DecorationSet {
  const all = state.field(lenses.field, false)
  if (!all?.length || !useSettings.getState().codeLens) return Decoration.none
  const doc = state.doc
  const byLine = new Map<number, CodeLens[]>()
  for (const lens of all) {
    const line = doc.lineAt(offsetOf(doc, lens.range.start)).number
    const at = byLine.get(line)
    if (at) at.push(lens)
    else byLine.set(line, [lens])
  }
  const b = new RangeSetBuilder<Decoration>()
  for (const line of [...byLine.keys()].sort((x, y) => x - y)) {
    const text = doc.line(line)
    const indent = /^[ \t]*/.exec(text.text)?.[0].length ?? 0
    b.add(
      text.from,
      text.from,
      Decoration.widget({
        widget: new LensWidget(byLine.get(line) ?? [], indent),
        block: true,
        side: -1,
      }),
    )
  }
  return b.finish()
}

/** The locations a lens's command carries, whatever shape the server used:
 *  `Location[]` (what `editor.action.showReferences` passes) or `LocationLink[]`. */
function locationsIn(args: unknown[] | undefined): LspLocation[] {
  const found: LspLocation[] = []
  for (const arg of args ?? []) {
    if (!Array.isArray(arg)) continue
    for (const item of arg) {
      const o = item as Partial<LspLocation> & {
        targetUri?: string
        targetSelectionRange?: LspLocation["range"]
        targetRange?: LspLocation["range"]
      }
      if (o?.uri && o.range) found.push({ uri: o.uri, range: o.range })
      else if (o?.targetUri && (o.targetSelectionRange || o.targetRange))
        found.push({
          uri: o.targetUri,
          range: (o.targetSelectionRange ?? o.targetRange) as LspLocation["range"],
        })
    }
  }
  return found
}

const openLocation = (loc: LspLocation) =>
  useProject.getState().open(fromUri(loc.uri), loc.range.start.line + 1)

/**
 * Do what the lens says.
 *
 * A lens that carries locations is Reado's to open — one goes straight there,
 * several become a list to pick from. A lens that names a command the *server*
 * runs goes back to the server. Anything else says so: a click that silently
 * does nothing is worse than one that admits it can't.
 */
async function runLens(view: EditorView, lens: CodeLens, e: MouseEvent): Promise<void> {
  const cmd = lens.command
  if (!cmd) return
  const locs = locationsIn(cmd.arguments)
  if (locs.length === 1) return openLocation(locs[0])
  if (locs.length > 1) {
    view.dispatch({
      effects: showLensLocations.of({
        x: e.clientX,
        y: e.clientY,
        locations: locs.map((l) => ({ path: fromUri(l.uri), line: l.range.start.line + 1 })),
      }),
    })
    return
  }
  const plugin = LSPPlugin.get(view)
  const caps = plugin?.client.serverCapabilities as ServerCaps | undefined
  if (plugin && caps?.executeCommandProvider?.commands?.includes(cmd.command)) {
    try {
      await plugin.client.request("workspace/executeCommand", {
        command: cmd.command,
        arguments: cmd.arguments,
      })
    } catch (err) {
      log.warn("workspace/executeCommand failed", { error: safeError(err) })
      notify("error", t("lsp.lensFailed", { title: cmd.title }))
    }
    return
  }
  notify("info", t("lsp.lensUnsupported", { command: cmd.command }))
}

/** Recompute the rows because something outside the document changed — today
 *  only the setting being switched. */
const redrawLenses = StateEffect.define<null>()

/**
 * The rows themselves.
 *
 * A state field, not a view plugin: these are *block* widgets, and a decoration
 * that changes the vertical layout has to be part of the state — CodeMirror
 * ignores a block widget handed to it by a plugin, which is why the lenses
 * resolved, arrived, and drew nothing.
 */
const lensRows = StateField.define<DecorationSet>({
  create: (state) => lensDecorations(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.startState.field(lenses.field, false) !== tr.state.field(lenses.field, false) ||
      tr.effects.some((e) => e.is(redrawLenses))
    )
      return lensDecorations(tr.state)
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

/**
 * Tell a server whether to compute lenses at all.
 *
 * Declaring `textDocument.codeLens` is only half of it: that makes
 * typescript-language-server *build* its lens providers, and they then refuse to
 * answer because their setting is off in the workspace configuration it starts
 * with. It never asks us about that section — it only asks about formatting — so
 * a client that never pushes its settings gets an empty list forever, with
 * providers in place and nothing to say. This is the push.
 */
export function pushLensConfig(key: string): void {
  const on = useSettings.getState().codeLens
  const lens = {
    implementationsCodeLens: { enabled: on },
    // A plain function's callers are exactly what a reader wants without asking.
    referencesCodeLens: { enabled: on, showOnAllFunctions: on },
  }
  void lspSend(
    key,
    JSON.stringify({
      jsonrpc: "2.0",
      method: "workspace/didChangeConfiguration",
      params: { settings: { typescript: lens, javascript: lens } },
    }),
  )
}

/**
 * Turning the setting on after a server is already up has to reach it, or the
 * requests we start making come back empty from providers that were told no.
 *
 * Registered on the first connection rather than at import: a module that
 * subscribes to a store the moment it is loaded does work for a program that
 * may never open a file, and breaks anything standing in for that store.
 */
let watchingLensSetting = false
export function watchLensSetting(): void {
  if (watchingLensSetting) return
  watchingLensSetting = true
  useSettings.subscribe((now, before) => {
    if (now.codeLens === before.codeLens) return
    for (const key of conns.keys()) pushLensConfig(key)
  })
}

/**
 * The two things that move lenses from outside the document: the user flipping
 * the setting (not editor state, so it schedules no update of its own), and the
 * server saying its answer changed.
 */
const lensSettingWatcher = ViewPlugin.fromClass(
  class {
    off: () => void
    again: () => void
    constructor(view: EditorView) {
      this.off = useSettings.subscribe((s, prev) => {
        if (s.codeLens !== prev.codeLens) view.dispatch({ effects: redrawLenses.of(null) })
      })
      this.again = () => lenses.refetch(view)
      lensRefreshers.add(this.again)
    }
    destroy() {
      this.off()
      lensRefreshers.delete(this.again)
    }
  },
)

export const codeLenses = (): Extension => [lenses.extension, lensRows, lensSettingWatcher]
