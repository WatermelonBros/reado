/**
 * Language Server integration (CodeMirror side).
 *
 * The Rust backend hosts the server processes; here we connect a CodeMirror
 * `LSPClient` to one per (server, project root) through a Tauri-backed transport,
 * and hand the editor a `languageServerSupport` extension for the open file.
 * Servers must be installed on the user's machine; when absent, `lsp_start`
 * fails and we silently fall back to the index-based features.
 */

import {
  type Completion,
  type CompletionContext,
  type CompletionSource,
  insertCompletionText,
  snippet,
} from "@codemirror/autocomplete"
import { getIndentUnit, indentUnit } from "@codemirror/language"
import { type Diagnostic, forEachDiagnostic, setDiagnostics } from "@codemirror/lint"
import type { Transport } from "@codemirror/lsp-client"
import { LSPClient, LSPPlugin, renameKeymap, signatureHelp } from "@codemirror/lsp-client"
import {
  EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  keymap,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { create } from "zustand"
import {
  type Backup,
  lspInstalled,
  lspSend,
  lspStart,
  lspStop,
  readFile,
  resolvePath,
  writeBacked,
} from "./api"
import { toRelative } from "./comments"
import { useDiagnostics } from "./diagnostics"
import { LANG_SERVERS, useExtensions } from "./extensions"
import { useFileUndo } from "./fileUndo"
import { createLogger } from "./logger"
import { notify } from "./notice"
import type { OutlineSymbol } from "./outline"
import { noteSelfWrite } from "./readProgress"
import { rootFor } from "./workspace"

const log = createLogger("lsp")

import { t } from "@/i18n"
import { explainSymbolAt, taskFromDiagnostic } from "./lspActions"

interface ServerDef {
  /** Server name — resolved to an actual binary on the Rust side (allowlist). */
  id: string
  exts: string[]
}

// Which server handles which extension. The binary for each `id` lives in the
// Rust allowlist (`server_command`), not here, so the webview can't choose it.
const SERVERS: ServerDef[] = [
  { id: "typescript", exts: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"] },
  { id: "rust", exts: ["rs"] },
  { id: "python", exts: ["py", "pyi"] },
  { id: "go", exts: ["go"] },
  { id: "cpp", exts: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh"] },
  { id: "bash", exts: ["sh", "bash"] },
  { id: "csharp", exts: ["cs"] },
  { id: "java", exts: ["java"] },
  { id: "kotlin", exts: ["kt", "kts"] },
  { id: "scala", exts: ["scala", "sbt", "sc"] },
  { id: "ruby", exts: ["rb"] },
  { id: "php", exts: ["php"] },
  { id: "lua", exts: ["lua"] },
  { id: "swift", exts: ["swift"] },
  { id: "zig", exts: ["zig"] },
  { id: "html", exts: ["html", "htm"] },
  { id: "css", exts: ["css", "scss", "less"] },
  { id: "json", exts: ["json", "jsonc"] },
  { id: "yaml", exts: ["yaml", "yml"] },
  { id: "vue", exts: ["vue"] },
  { id: "svelte", exts: ["svelte"] },
  { id: "solidity", exts: ["sol"] },
  { id: "terraform", exts: ["tf", "tfvars"] },
  { id: "toml", exts: ["toml"] },
]

// LSP language identifiers per extension. Crucially `.tsx`/`.jsx` are *react*
// dialects — telling the server a `.tsx` file is plain "typescript" makes it
// parse every JSX tag as a syntax error.
const LANG_IDS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  rs: "rust",
  py: "python",
  pyi: "python",
  go: "go",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  sh: "shellscript",
  bash: "shellscript",
  cs: "csharp",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sbt: "scala",
  sc: "scala",
  rb: "ruby",
  php: "php",
  lua: "lua",
  swift: "swift",
  zig: "zig",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  vue: "vue",
  svelte: "svelte",
  sol: "solidity",
  tf: "terraform",
  tfvars: "terraform",
  toml: "toml",
}

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? ""
// A server applies only if its extension matches *and* the user hasn't disabled
// it in the marketplace.
const serverFor = (path: string) =>
  SERVERS.find((s) => s.exts.includes(extOf(path)) && useExtensions.getState().isEnabled(s.id)) ??
  null
/** The LSP/editor language id for a file — also what snippet and grammar
 *  contributions key on, so they resolve languages the same way servers do. */
export const langIdFor = (path: string) => LANG_IDS[extOf(path)] ?? extOf(path)

/** A file:// URI for an absolute path (spaces and the like encoded). Handles
 *  Windows paths (`C:\…`): backslashes are normalized and the drive gets a
 *  leading slash (`file:///C:/…`), with the drive-letter colon left intact. */
const toUri = (absPath: string) => {
  const p = absPath.replace(/\\/g, "/")
  const withSlash = p.startsWith("/") ? p : `/${p}`
  const enc = withSlash
    .split("/")
    .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join("/")
  return `file://${enc}`
}

/** The absolute path back out of a file:// URI (undoes `toUri`). */
const fromUri = (uri: string) => {
  const p = decodeURIComponent(uri.replace(/^file:\/\//, ""))
  // "/C:/…" → "C:/…" on Windows; leave a POSIX "/…" path untouched.
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p
}

/** Tap `publishDiagnostics` to surface per-file error counts outside the editor
 * (red filenames in the tree). The CodeMirror client still renders them; this
 * just mirrors the error count into a store. */
function tapDiagnostics(payload: string) {
  let msg: {
    method?: string
    params?: {
      uri: string
      diagnostics: {
        severity?: number
        message?: string
        range?: { start?: { line?: number; character?: number } }
      }[]
    }
  }
  try {
    msg = JSON.parse(payload)
  } catch {
    return
  }
  if (msg.method !== "textDocument/publishDiagnostics" || !msg.params) return
  const items = msg.params.diagnostics.map((d) => ({
    line: (d.range?.start?.line ?? 0) + 1,
    character: d.range?.start?.character ?? 0,
    severity: d.severity ?? 1,
    message: d.message ?? "",
  }))
  useDiagnostics.getState().setFileDiagnostics(fromUri(msg.params.uri), items)
}

// ---- Diagnostics + sync (replacing the library's bundled `serverDiagnostics`,
// which we can't extend with an action) ------------------------------------

interface LspPos {
  line: number
  character: number
}
interface LspDiag {
  range: { start: LspPos; end: LspPos }
  severity?: number
  message: string
}
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

/** Our `serverDiagnostics`: renders server diagnostics as lint markers (as the
 * library does) but adds a "Create task" action so the user can turn a problem
 * into an anchored task comment straight from the tooltip. */
function serverDiagnostics() {
  return {
    clientCapabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    notificationHandlers: {
      "textDocument/publishDiagnostics": (client: LSPClient, params: PublishParams) => {
        const file = client.workspace.getFile(params.uri)
        if (!file || (params.version != null && params.version !== file.version)) return false
        const view = file.getView()
        const plugin = view && LSPPlugin.get(view)
        if (!view || !plugin) return false
        view.dispatch(
          setDiagnostics(
            view.state,
            params.diagnostics.map((item): Diagnostic => {
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
        return true
      },
    },
    editorExtension: autoSync,
  }
}

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

const inlayHints = (): Extension => [inlayField, inlayFetcher]

/** Render the server's hover markdown into a calm DOM. We don't run a full
 * markdown parser (it would pull in a dep and risk HTML injection): fenced code
 * blocks go to <pre>, everything else is plain text. */
function renderHoverDoc(md: string): HTMLElement {
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
function lspHoverTooltip() {
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

/** The per-client LSP feature set: completion, hover, signature help, our
 * diagnostics, inlay hints, and the rename keymap. Definition/references
 * navigation is handled by the editor's own gestures (which fall back to the
 * index), so the library's F12/Shift-F12 keymaps are intentionally left out —
 * and so is its ⇧⌥F, because Reado binds Format Document globally to its own
 * pipeline (which tries the server first, then a configured formatter). Two
 * bindings on one key meant the document was formatted twice. */
const clientExtensions = () => [
  completionWithImports(),
  lspHoverTooltip(),
  keymap.of([...renameKeymap]),
  signatureHelp(),
  serverDiagnostics(),
  inlayHints(),
]

// ---- Completion, with the import it needs -------------------------------

/** A completion item, in the parts we use. */
export interface LspCompletionItem {
  label: string
  labelDetails?: { detail?: string; description?: string }
  kind?: number
  detail?: string
  documentation?: string | { value: string }
  sortText?: string
  filterText?: string
  insertText?: string
  insertTextFormat?: number
  textEdit?: { newText: string; range?: LspRange; insert?: LspRange; replace?: LspRange }
  textEditText?: string
  additionalTextEdits?: LspTextEdit[]
  /** Opaque: handed back verbatim in `completionItem/resolve`. */
  data?: unknown
}
interface LspRange {
  start: LspPos
  end: LspPos
}
interface LspCompletionList {
  isIncomplete?: boolean
  items: LspCompletionItem[]
}

// LSP CompletionItemKind → CodeMirror's completion types (which drive the icon).
const COMPLETION_TYPE: Record<number, string> = {
  2: "method",
  3: "function",
  4: "class",
  5: "property",
  6: "variable",
  7: "class",
  8: "interface",
  9: "namespace",
  10: "property",
  11: "keyword",
  12: "constant",
  13: "enum",
  14: "keyword",
  21: "constant",
  22: "type",
  23: "variable",
  25: "type",
}

/** LSP snippet syntax (`$1`, `${1:name}`) in CodeMirror's (`${name}`). */
const toCmSnippet = (text: string) =>
  text.replace(/\\([$}\\])|\$(\d+)|\$\{\d+:([^}]*)\}/g, (_m, esc, field, named) =>
    esc ? esc : named !== undefined ? `\${${named}}` : `\${${field}}`,
  )

/**
 * Completion from the language server — including the import the completed
 * symbol needs.
 *
 * `serverCompletion()` from `@codemirror/lsp-client` applies an item's
 * `additionalTextEdits` (the import line) only when the server sent them with the
 * item. No TypeScript server does: an auto-import item arrives as a bare name
 * plus an opaque `data`, and the edit that adds `import { useState } from "react"`
 * exists only once the client asks for it with `completionItem/resolve`. Nothing
 * in the library ever asks, so accepting `useState` in a file that never imported
 * it typed the name and left the file broken — the import was never suggested,
 * because the only thing that knew about it was never consulted.
 *
 * So the request is ours: the list comes back as it does anywhere else, and
 * accepting an item resolves it first and applies whatever edits come with it.
 */
function lspCompletionSource(): CompletionSource {
  return async (ctx: CompletionContext) => {
    const plugin = ctx.view && LSPPlugin.get(ctx.view)
    const provider = plugin?.client.serverCapabilities?.completionProvider as
      | { triggerCharacters?: string[] }
      | undefined
    // `serverCapabilities` is null until `initialize` comes back; a server that
    // answered and offers no completion is a different thing, and stays quiet.
    if (!plugin || (plugin.client.serverCapabilities && !provider)) return null
    const before = ctx.state.sliceDoc(ctx.pos - 1, ctx.pos)
    const triggers = provider?.triggerCharacters
    const isTrigger = !!triggers?.includes(before)
    if (!ctx.explicit && !isTrigger && !/[\w$]/.test(before)) return null

    plugin.client.sync()
    const res = await plugin.client
      .request<object, LspCompletionList | LspCompletionItem[] | null>("textDocument/completion", {
        textDocument: { uri: plugin.uri },
        position: plugin.toPosition(ctx.pos),
        context: isTrigger
          ? { triggerKind: 2, triggerCharacter: before }
          : { triggerKind: ctx.explicit ? 1 : 1 },
      })
      .catch(() => null)
    if (!res) return null
    const list = Array.isArray(res) ? { items: res } : res
    if (!list.items.length) return null

    const word = ctx.state.wordAt(ctx.pos)
    const from = word ? word.from : ctx.pos
    return {
      from,
      // An incomplete list must be re-requested as the user keeps typing —
      // TypeScript sends one for member access, and reusing it shows stale names.
      validFor: list.isIncomplete ? undefined : /^[\w$]*$/,
      options: list.items.map((item) => ({
        label: item.filterText || item.label,
        displayLabel: item.label,
        type: item.kind ? COMPLETION_TYPE[item.kind] : undefined,
        // What the item is, or where it would be imported from — the "react"
        // beside `useState` that says this one carries an import.
        detail: item.labelDetails?.description ?? item.detail,
        sortText: item.sortText,
        info: item.documentation
          ? () =>
              renderHoverDoc(
                typeof item.documentation === "string"
                  ? item.documentation
                  : (item.documentation?.value ?? ""),
              )
          : undefined,
        apply: (view: EditorView, _c: Completion, aFrom: number, aTo: number) =>
          applyCompletion(plugin, view, item, aFrom, aTo),
      })),
    }
  }
}

/**
 * Put an accepted item in the document, then the edits it depends on. Exported
 * for the test that pins the import actually arriving.
 *
 * The insert happens now — typing must not wait on a round trip — and the import
 * lands when the server answers, as a second transaction. `changeFilter`-safe:
 * the edit's positions are computed against the document as it is when it
 * arrives, not as it was when the request went out.
 */
export function applyCompletion(
  plugin: LSPPlugin,
  view: EditorView,
  item: LspCompletionItem,
  from: number,
  to: number,
): void {
  const text = item.textEdit?.newText ?? item.textEditText ?? item.insertText ?? item.label
  if (item.insertTextFormat === 2) snippet(toCmSnippet(text))(view, null, from, to)
  else view.dispatch(insertCompletionText(view.state, text, from, to))

  const edits = item.additionalTextEdits
  if (edits?.length) {
    applyExtraEdits(plugin, view, edits)
    return
  }
  // Nothing to resolve: an item with no `data` has already told us everything.
  if (item.data === undefined) return
  plugin.client
    .request<LspCompletionItem, LspCompletionItem | null>("completionItem/resolve", item)
    .then((full) => {
      if (full?.additionalTextEdits?.length) {
        applyExtraEdits(plugin, view, full.additionalTextEdits)
      }
    })
    .catch((e) => log.warn("completion resolve failed", { error: String(e) }))
}

/** Apply an item's extra edits (the import line) to the live document. */
function applyExtraEdits(plugin: LSPPlugin, view: EditorView, edits: LspTextEdit[]): void {
  const doc = view.state.doc
  const changes = edits
    // An edit that no longer fits the document (the user kept typing, or deleted
    // past it) is dropped rather than throwing in the middle of a completion.
    .map((e) => {
      try {
        const from = plugin.fromPosition(e.range.start, doc)
        const to = plugin.fromPosition(e.range.end, doc)
        return from >= 0 && to <= doc.length && from <= to ? { from, to, insert: e.newText } : null
      } catch {
        return null
      }
    })
    .filter((c) => c !== null)
  if (changes.length) view.dispatch({ changes })
}

/**
 * The server's completions, as a source on the editor's existing popup.
 *
 * The array is not decoration: `LSPClient` keeps an extension only when it is an
 * array or carries an `extension` property, and a bare facet provider is neither
 * — handed one directly, it drops it without a word, and the server's
 * completions never reach the editor at all.
 */
// Built once, deliberately. CodeMirror matches a finished query back to the
// source that started it *by identity*, so a provider that mints a new function
// each time it is asked can never have its results accepted: every answer
// arrives belonging to a source that no longer exists, and the completion sits
// in "pending" forever — the server replies, and nothing is ever shown.
const LSP_COMPLETION = [{ autocomplete: lspCompletionSource() }]

export const completionWithImports = () => [EditorState.languageData.of(() => LSP_COMPLETION)]

/** Is a language server attached to this view? The editor's own word completion
 *  steps aside when one is: a server's list is the better answer, and both at
 *  once is the same name twice. */
export const lspAttached = (view: EditorView) => !!LSPPlugin.get(view)

interface LspLocation {
  uri: string
  range: { start: { line: number; character: number } }
}

/** Ask the server to locate a symbol (definition/typeDefinition/implementation)
 * at `pos` and open the result through the app's own navigation. Returns true
 * when a server is attached (so the caller falls back to the index only when no
 * server is present). */
export function lspLocate(
  view: EditorView,
  pos: number,
  method: "definition" | "typeDefinition" | "implementation",
  open: (path: string, line: number) => void,
): boolean {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return false
  plugin.client.sync()
  plugin.client
    .request<unknown, LspLocation | LspLocation[] | null>(`textDocument/${method}`, {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const loc = Array.isArray(res) ? res[0] : res
      if (loc) open(fromUri(loc.uri), loc.range.start.line + 1)
    })
    .catch(() => {})
  return true
}

/** Resolve the definition location of the symbol at `pos` via the server, for
 *  callers (like Peek) that render the result themselves instead of navigating.
 *  Returns null synchronously when no server is attached, so the caller can fall
 *  back to the symbol index; otherwise a promise of the location (or null). */
export function lspDefinition(
  view: EditorView,
  pos: number,
): Promise<{ path: string; line: number } | null> | null {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  plugin.client.sync()
  return plugin.client
    .request<unknown, LspLocation | LspLocation[] | null>("textDocument/definition", {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const loc = Array.isArray(res) ? res[0] : res
      return loc ? { path: fromUri(loc.uri), line: loc.range.start.line + 1 } : null
    })
    .catch(() => null)
}

// LSP SymbolKind (a subset) → the outline's coarser kinds. Unmapped kinds fall
// through to "variable" so nothing is silently dropped.
const SYMBOL_KIND: Record<number, OutlineSymbol["kind"]> = {
  5: "class", // Class
  23: "class", // Struct
  6: "method", // Method
  9: "method", // Constructor
  12: "function", // Function
  11: "type", // Interface
  10: "type", // Enum
  26: "type", // TypeParameter
  13: "variable", // Variable
  14: "variable", // Constant
  8: "variable", // Field
  7: "variable", // Property
}

interface DocSymbol {
  name: string
  kind: number
  range?: { start: { line: number } }
  selectionRange?: { start: { line: number } }
  location?: { range: { start: { line: number } } }
  children?: DocSymbol[]
}

/** An LSP `TextEdit` — a replacement over a line/character range. */
interface LspTextEdit {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  newText: string
}

/**
 * Format the view's document through its language server, and resolve once the
 * edits have landed.
 *
 * `@codemirror/lsp-client` exports a `formatDocument` command, but it is
 * fire-and-forget: it returns true the moment the request goes out. Format on
 * save has to know the buffer is settled *before* it writes, so this is the
 * awaitable version.
 *
 * Resolves to what the server did, or null when this file has no server or the
 * server offers no formatting — the caller then falls through to the project's
 * own formatter.
 */
export async function lspFormat(view: EditorView): Promise<"formatted" | "unchanged" | null> {
  const plugin = LSPPlugin.get(view)
  if (!plugin?.client.serverCapabilities?.documentFormattingProvider) return null
  const before = view.state.doc
  try {
    plugin.client.sync()
    const edits = await plugin.client.request<object, LspTextEdit[] | null>(
      "textDocument/formatting",
      {
        textDocument: { uri: plugin.uri },
        options: {
          tabSize: getIndentUnit(view.state),
          insertSpaces: !view.state.facet(indentUnit).includes("\t"),
        },
      },
    )
    // The user kept typing while the server thought. Applying offsets computed
    // against the old document would corrupt the new one.
    if (view.state.doc !== before) return "unchanged"
    if (!edits?.length) return "unchanged"
    view.dispatch({
      changes: edits.map((e) => ({
        from: plugin.fromPosition(e.range.start, before),
        to: plugin.fromPosition(e.range.end, before),
        insert: e.newText,
      })),
    })
    return "formatted"
  } catch (e) {
    // A server that errors on formatting shouldn't block the project's own
    // formatter from trying.
    log.warn("server formatting failed", { error: String(e) })
    return null
  }
}

/**
 * Format just the selection through the language server
 * (`textDocument/rangeFormatting`).
 *
 * Selection formatting is a server capability only: the project's own
 * formatters run over whole files, so there is nothing to fall back to.
 * `null` means "no server, or it can't format ranges" and the caller says so.
 */
export async function lspFormatRange(view: EditorView): Promise<"formatted" | "unchanged" | null> {
  const plugin = LSPPlugin.get(view)
  if (!plugin?.client.serverCapabilities?.documentRangeFormattingProvider) return null
  const range = view.state.selection.main
  if (range.empty) return null
  const before = view.state.doc
  try {
    plugin.client.sync()
    const edits = await plugin.client.request<object, LspTextEdit[] | null>(
      "textDocument/rangeFormatting",
      {
        textDocument: { uri: plugin.uri },
        range: {
          start: plugin.toPosition(range.from, before),
          end: plugin.toPosition(range.to, before),
        },
        options: {
          tabSize: getIndentUnit(view.state),
          insertSpaces: !view.state.facet(indentUnit).includes("\t"),
        },
      },
    )
    // Same guard as whole-document formatting: offsets computed against a
    // document the user has since changed would corrupt it.
    if (view.state.doc !== before) return "unchanged"
    if (!edits?.length) return "unchanged"
    view.dispatch({
      changes: edits.map((e) => ({
        from: plugin.fromPosition(e.range.start, before),
        to: plugin.fromPosition(e.range.end, before),
        insert: e.newText,
      })),
    })
    return "formatted"
  } catch (e) {
    log.warn("server range formatting failed", { error: String(e) })
    return null
  }
}

/** An LSP `WorkspaceEdit`: text edits keyed by file URI. */
interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>
  /** The newer, versioned form. Reado reads both; servers send one or the other. */
  documentChanges?: Array<{ textDocument: { uri: string }; edits: LspTextEdit[] }>
}

/** One thing a server offers to do about the code at the cursor. */
export interface CodeAction {
  title: string
  /** LSP `kind` ("quickfix", "refactor.extract", "source.organizeImports", …).
   *  Used to tell a fix from a refactor from a source action in the menu. */
  kind?: string
  /** True for the action a server marks as the obvious one. */
  isPreferred?: boolean
  /** The edit to apply, when the action carries one outright. */
  edit?: LspWorkspaceEdit
  /** A command to run instead — for servers that compute the edit lazily. */
  command?: { command: string; arguments?: unknown[]; title?: string }
  /** An unresolved action: `codeAction/resolve` fills in its `edit`. */
  data?: unknown
}

/** Everything the code-action menu needs about one entry. */
export interface ResolvedAction extends CodeAction {
  /** Run it: applies the edit, or asks the server to execute the command. */
  apply: () => Promise<void>
}

/**
 * Ask the server what it can do about `range`.
 *
 * Returns null when no server is attached or it has no code-action support, so
 * the caller can say "nothing here" rather than showing an empty menu.
 */
export async function lspCodeActions(
  view: EditorView,
  from: number,
  to: number,
  only?: string[],
): Promise<ResolvedAction[] | null> {
  const plugin = LSPPlugin.get(view)
  if (!plugin?.client.serverCapabilities?.codeActionProvider) return null
  plugin.client.sync()
  const doc = view.state.doc

  // The diagnostics overlapping the range: a server needs them to offer the fix
  // *for* a problem rather than a generic refactor.
  const diagnostics: LspDiag[] = []
  forEachDiagnostic(view.state, (d, dFrom, dTo) => {
    if (dTo < from || dFrom > to) return
    diagnostics.push({
      range: { start: plugin.toPosition(dFrom, doc), end: plugin.toPosition(dTo, doc) },
      severity: d.severity === "error" ? 1 : d.severity === "warning" ? 2 : 3,
      message: d.message,
    })
  })

  try {
    const actions = await plugin.client.request<object, Array<CodeAction | null> | null>(
      "textDocument/codeAction",
      {
        textDocument: { uri: plugin.uri },
        range: { start: plugin.toPosition(from, doc), end: plugin.toPosition(to, doc) },
        context: { diagnostics, ...(only ? { only } : {}) },
      },
    )
    if (!actions) return []
    // A server may answer with bare `Command`s instead of `CodeAction`s; those
    // have a `command` string where an action has a title and a kind.
    return actions.filter((a): a is CodeAction => !!a?.title).map((a) => resolveAction(plugin, a))
  } catch (e) {
    log.warn("code actions failed", { error: String(e) })
    return null
  }
}

/** Wrap a raw action with the work of actually performing it. */
function resolveAction(plugin: LSPPlugin, action: CodeAction): ResolvedAction {
  return {
    ...action,
    apply: async () => {
      let edit = action.edit
      // Lazily-computed actions come back without an edit; the server fills it
      // in on request. Skipping this leaves half the fixes doing nothing.
      if (!edit && action.data !== undefined) {
        try {
          const full = await plugin.client.request<CodeAction, CodeAction>(
            "codeAction/resolve",
            action,
          )
          edit = full?.edit
        } catch (e) {
          log.warn("code action resolve failed", { error: String(e) })
        }
      }
      if (edit) await applyWorkspaceEdit(plugin, edit)
      if (action.command) {
        try {
          await plugin.client.request<object, unknown>("workspace/executeCommand", {
            command: action.command.command,
            arguments: action.command.arguments,
          })
        } catch (e) {
          log.warn("code action command failed", { error: String(e) })
        }
      }
    },
  }
}

/**
 * Apply a `WorkspaceEdit`.
 *
 * The open document is edited through its own view, so the change lands in the
 * undo history with everything else. Other files are rewritten on disk through
 * the backend — a fix that renames a symbol in five files has to reach all five,
 * and only one of them is on screen.
 */
async function applyWorkspaceEdit(plugin: LSPPlugin, edit: LspWorkspaceEdit): Promise<void> {
  const byUri: Record<string, LspTextEdit[]> = { ...(edit.changes ?? {}) }
  for (const change of edit.documentChanges ?? []) {
    byUri[change.textDocument.uri] = [
      ...(byUri[change.textDocument.uri] ?? []),
      ...(change.edits ?? []),
    ]
  }
  const backups: Backup[] = []
  for (const [uri, edits] of Object.entries(byUri)) {
    if (!edits.length) continue
    if (uri === plugin.uri) {
      const view = plugin.view
      const before = view.state.doc
      view.dispatch({
        changes: edits.map((e) => ({
          from: plugin.fromPosition(e.range.start, before),
          to: plugin.fromPosition(e.range.end, before),
          insert: e.newText,
        })),
      })
    } else {
      backups.push(...(await applyEditsOnDisk(fromUri(uri), edits)))
    }
  }
  // One decision, one undo — the guarantee every other bulk write in the app
  // gives. The open document's own edit is already in its editor history.
  if (backups.length > 0) useFileUndo.getState().record({ kind: "replace", backups })
}

/**
 * Rewrite a file Reado does not have open, applying LSP edits to its bytes.
 *
 * Edits are applied back-to-front so earlier offsets stay valid, which is what
 * the LSP spec requires of a client.
 */
export function applyTextEdits(text: string, edits: LspTextEdit[]): string {
  const lines = text.split("\n")
  /** A line/character position as an offset into the joined text. */
  const offsetOf = (p: { line: number; character: number }) => {
    let at = 0
    for (let i = 0; i < Math.min(p.line, lines.length); i++) at += lines[i].length + 1
    return at + p.character
  }
  // Back to front, so the offsets computed above stay valid as text is spliced
  // in — which is what the LSP spec requires of a client.
  const ordered = [...edits].sort((a, b) => offsetOf(b.range.start) - offsetOf(a.range.start))
  let out = text
  for (const e of ordered) {
    out = out.slice(0, offsetOf(e.range.start)) + e.newText + out.slice(offsetOf(e.range.end))
  }
  return out
}

async function applyEditsOnDisk(path: string, edits: LspTextEdit[]): Promise<Backup[]> {
  const root = rootFor(path)
  try {
    const content = await readFile(root, path)
    if (content.kind !== "text") return []
    const rel = toRelative(root, path)
    noteSelfWrite(rel)
    // Through the same backed-up write every other bulk rewrite uses. A rename
    // that touches five files is the most destructive thing a code action does,
    // and it was the one write in the app ⌘Z could not take back.
    const res = await writeBacked(root, rel, applyTextEdits(content.text, edits), content.encoding)
    return res.backups
  } catch (e) {
    log.warn("workspace edit on disk failed", { path, error: String(e) })
    return []
  }
}

/** Ask the server for the active file's document symbols, mapped to the outline/** Ask the server for the active file's document symbols, mapped to the outline
 *  shape. Returns null synchronously when no server is attached (caller falls
 *  back to the heuristic extractor); otherwise a promise of symbols (or null). */
export function lspDocumentSymbols(view: EditorView): Promise<OutlineSymbol[] | null> | null {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  plugin.client.sync()
  return plugin.client
    .request<unknown, DocSymbol[] | null>("textDocument/documentSymbol", {
      textDocument: { uri: plugin.uri },
    })
    .then((res) => {
      if (!res?.length) return null
      const out: OutlineSymbol[] = []
      const walk = (syms: DocSymbol[]) => {
        for (const s of syms) {
          const line = (s.selectionRange ?? s.range ?? s.location?.range)?.start.line ?? 0
          out.push({ name: s.name, kind: SYMBOL_KIND[s.kind] ?? "variable", line: line + 1 })
          if (s.children?.length) walk(s.children)
        }
      }
      walk(res)
      out.sort((a, b) => a.line - b.line)
      return out
    })
    .catch(() => null)
}

// ---- Call & type hierarchy --------------------------------------------------

/** An LSP CallHierarchyItem / TypeHierarchyItem (the fields we use). */
export interface HierItem {
  name: string
  detail?: string
  kind?: number
  uri: string
  range?: { start: { line: number } }
  selectionRange?: { start: { line: number } }
}

/** A resolved hierarchy node for the UI (navigable). */
export interface HierNode {
  name: string
  detail?: string
  path: string
  line: number
  /** The original item, so the caller can re-root the hierarchy on it. */
  item: HierItem
}

const toHierNode = (i: HierItem): HierNode => ({
  name: i.name,
  detail: i.detail,
  path: fromUri(i.uri),
  line: ((i.selectionRange ?? i.range)?.start.line ?? 0) + 1,
  item: i,
})

/** Prepare a call/type hierarchy at `pos`. Returns null when no server is
 *  attached or the server lacks the capability (caller can fall back). */
function prepareHierarchy(
  view: EditorView,
  pos: number,
  kind: "callHierarchy" | "typeHierarchy",
): Promise<HierNode[] | null> | null {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  plugin.client.sync()
  const method =
    kind === "callHierarchy"
      ? "textDocument/prepareCallHierarchy"
      : "textDocument/prepareTypeHierarchy"
  return plugin.client
    .request<unknown, HierItem[] | null>(method, {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => (res?.length ? res.map(toHierNode) : null))
    .catch(() => null)
}

export const lspPrepareCallHierarchy = (view: EditorView, pos: number) =>
  prepareHierarchy(view, pos, "callHierarchy")
export const lspPrepareTypeHierarchy = (view: EditorView, pos: number) =>
  prepareHierarchy(view, pos, "typeHierarchy")

interface CallEdge {
  from?: HierItem
  to?: HierItem
}

/** Incoming (callers) or outgoing (callees) for a call-hierarchy item. */
export function lspCalls(
  view: EditorView,
  item: HierItem,
  direction: "incoming" | "outgoing",
): Promise<HierNode[] | null> | null {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  const method =
    direction === "incoming" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls"
  return plugin.client
    .request<unknown, CallEdge[] | null>(method, { item })
    .then((res) =>
      res
        ? res.map((e) => toHierNode((direction === "incoming" ? e.from : e.to) as HierItem))
        : null,
    )
    .catch(() => null)
}

/** Supertypes (bases) or subtypes (implementers) for a type-hierarchy item. */
export function lspTypes(
  view: EditorView,
  item: HierItem,
  direction: "super" | "sub",
): Promise<HierNode[] | null> | null {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  const method = direction === "super" ? "typeHierarchy/supertypes" : "typeHierarchy/subtypes"
  return plugin.client
    .request<unknown, HierItem[] | null>(method, { item })
    .then((res) => (res ? res.map(toHierNode) : null))
    .catch(() => null)
}

interface Conn {
  client: LSPClient
  unlisten: Promise<UnlistenFn>
  exitUnlisten: Promise<UnlistenFn>
}
const conns = new Map<string, Promise<Conn>>()

// Connections we've already told the user crashed, so a flapping server notifies
// at most once until it successfully reconnects (the flag is cleared on connect).
const crashNotified = new Set<string>()

/** Drop a connection and unsubscribe both its listeners (idempotent). */
function dropConn(key: string): void {
  const p = conns.get(key)
  conns.delete(key)
  if (!p) return
  void p
    .then((c) => {
      void c.unlisten.then((u) => u()).catch(() => {})
      void c.exitUnlisten.then((u) => u()).catch(() => {})
    })
    .catch(() => {})
}

// Language servers run in the Rust backend and outlive a webview reload, but
// this client's open-document state does not. After a reload the fresh CM
// LSP client re-sends `didOpen` for files the surviving server still considers
// open, which it rejects ("Can't open already open document"). Tie the server
// lifecycle to this webview session: stop the servers we started when the page
// goes away, so the next load spawns each server fresh.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    // Clear the map first so the resulting exit events read as intentional.
    for (const key of [...conns.keys()]) {
      dropConn(key)
      void lspStop(key)
    }
  })
}

/**
 * Identify a server + project root, in a string that can also name a Tauri event.
 *
 * Tauri accepts only `[A-Za-z0-9-/:_]` in an event name, and this id names two of
 * them (`lsp-…`, `lsp-exit-…`). A project path holding a dot or a space —
 * `~/code/pi.frontend-app` — made `listen` throw *after* the server had already
 * spawned: a running language server nobody was subscribed to, no code
 * intelligence, and a fresh attempt (and a fresh process) every few seconds.
 * The digest keeps two paths that sanitise alike from sharing one session.
 */
function connKey(serverId: string, root: string): string {
  let h = 7
  for (const c of root) h = (h * 31 + c.charCodeAt(0)) | 0
  return `${serverId}:${root.replace(/[^A-Za-z0-9\-/:_]/g, "_")}:${(h >>> 0).toString(36)}`
}

/** Get (or create) a connected client for a server + project root. */
function connect(server: ServerDef, root: string): Promise<Conn> {
  const key = connKey(server.id, root)
  const existing = conns.get(key)
  if (existing) return existing

  const p = (async () => {
    // Spawn the server first; this throws if it isn't installed/allowed.
    await lspStart(key, server.id, root)
    log.info("client connected", { server: server.id })
    crashNotified.delete(key) // fresh connection — a future crash may notify again
    const handlers = new Set<(v: string) => void>()
    const unlisten = listen<string>(`lsp-${key}`, (e) => {
      tapDiagnostics(e.payload)
      for (const h of handlers) h(e.payload)
    })
    // The backend signals a dead server here. If we didn't tear it down on
    // purpose, drop the stale connection (so the next interaction reconnects a
    // fresh server) and tell the user once — a crashed server otherwise breaks
    // code intelligence silently.
    const exitUnlisten = listen(`lsp-exit-${key}`, () => {
      if (!conns.has(key)) return // intentional stop already removed it
      log.warn("language server exited unexpectedly", { server: server.id })
      dropConn(key)
      if (!crashNotified.has(key)) {
        crashNotified.add(key)
        notify("error", t("lsp.serverStopped", { name: server.id }))
      }
    })
    await unlisten // subscription live before we send `initialize`
    const transport: Transport = {
      send: (m) => void lspSend(key, m),
      subscribe: (h) => handlers.add(h),
      unsubscribe: (h) => handlers.delete(h),
    }
    // Diagnostics (`serverDiagnostics`) and document sync (`autoSync`) live in
    // these client-level extensions — `LSPPlugin.create` injects them into each
    // view. Without them the server never hears about edits and never publishes
    // diagnostics, so hover would work but errors would never surface.
    const client = new LSPClient({
      rootUri: toUri(root),
      extensions: clientExtensions(),
    }).connect(transport)
    return { client, unlisten, exitUnlisten }
  })()

  conns.set(key, p)
  // If startup failed (server missing), drop the cache entry so we don't retry
  // a dead promise and stay quiet.
  p.catch((e) => {
    log.error("client connect failed", { server: server.id, error: String(e) })
    conns.delete(key)
  })
  return p
}

// Angular has no extension of its own — it shares .ts/.html with TypeScript and
// HTML. Detect an Angular project (angular.json present) once per root so we can
// route those files to the Angular server instead.
const angularCache = new Map<string, Promise<boolean>>()
function isAngularProject(root: string): Promise<boolean> {
  let p = angularCache.get(root)
  if (!p) {
    p = resolvePath(root, "angular.json")
      .then((r) => r !== null)
      .catch(() => false)
    angularCache.set(root, p)
  }
  return p
}

// Whether each server's binary is on PATH, probed once per session, and which
// absences we've already reported.
const installProbe = new Map<string, Promise<boolean>>()
const missingNotified = new Set<string>()

/**
 * Bumped whenever the set of installed servers may have changed — an install
 * finishing, mainly.
 *
 * Open editors watch it and try to attach again. Installing a language server
 * used to change nothing at all until the window was rebuilt: the file you were
 * looking at, the one whose missing diagnostics sent you to install it, stayed
 * exactly as dead as before.
 */
export const useLspServers = create<{ nonce: number; refresh: () => void }>((set) => ({
  nonce: 0,
  refresh: () => {
    installProbe.clear()
    missingNotified.clear()
    set((s) => ({ nonce: s.nonce + 1 }))
  },
}))

/** Re-probe for servers and let open editors attach to a new one. */
export const refreshLspServers = () => useLspServers.getState().refresh()

/**
 * Is this server's binary actually installed?
 *
 * A missing server is the difference between an editor that knows the code and
 * one that guesses at it: no diagnostics, no import completions, and
 * go-to-definition down to whatever the symbol index happens to have seen. That
 * used to fail completely silently — `lsp_start` threw, we returned null, and
 * the editor just looked broken. Now it says so once per server, with the name
 * to install.
 *
 * A probe that itself fails answers "installed" so a broken check never blocks
 * a server that would have started.
 */
function checkInstalled(id: string, root: string): Promise<boolean> {
  const key = `${id}:${root}`
  let p = installProbe.get(key)
  if (!p) {
    p = lspInstalled(id, root).catch(() => true)
    installProbe.set(key, p)
  }
  return p.then((ok) => {
    if (!ok && !missingNotified.has(id)) {
      missingNotified.add(id)
      const ext = LANG_SERVERS.find((e) => e.id === id)
      notify("info", t("lsp.serverMissing", { name: ext?.name ?? id }))
    }
    return ok
  })
}

/**
 * The LSP editor extension for `path` in `root`, or null when no server is
 * configured/installed for the file's language.
 */
export async function lspSupport(root: string, path: string): Promise<Extension | null> {
  const ext = extOf(path)
  let server = serverFor(path)
  // In an Angular project, .ts/.html go to the Angular language server.
  if (
    (ext === "ts" || ext === "html" || ext === "htm") &&
    useExtensions.getState().isEnabled("angular") &&
    (await isAngularProject(root))
  ) {
    server = { id: "angular", exts: server?.exts ?? [ext] }
  }
  if (!server) return null
  if (!(await checkInstalled(server.id, root))) return null
  try {
    const { client } = await connect(server, root)
    return LSPPlugin.create(client, toUri(path), langIdFor(path))
  } catch {
    return null // server not installed / failed to start
  }
}

/** Whether a server is configured for this file (cheap check, no spawn). */
export const hasServer = (path: string) => serverFor(path) !== null

// On HMR, tear the servers down so the replaced module reconnects cleanly —
// otherwise the old processes linger and get a second `initialize` (protocol
// violation), which can wedge the editor in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const key of [...conns.keys()]) {
      log.debug("client disconnected", { key })
      dropConn(key) // unlistens both subscriptions and removes from the map
      void lspStop(key).catch(() => {})
    }
    crashNotified.clear()
    useDiagnostics.getState().reset()
  })
}
