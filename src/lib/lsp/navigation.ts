import { LSPPlugin } from "@codemirror/lsp-client"
import type { EditorView } from "@codemirror/view"
import { t } from "@/i18n"
import type { Symbol as IndexedSymbol } from "@/lib/api"
import { safeError } from "@/lib/logger"
import { notify } from "@/lib/notice"
import type { OutlineSymbol } from "@/lib/outline"
import { conns, fromUri, type LspLocation, type LspPos, log, readyPlugin } from "./shared"

/** Ask the server to locate a symbol (definition/typeDefinition/implementation)
 * at `pos` and open the result through the app's own navigation. Returns true
 * when a server is attached (so the caller falls back to the index only when no
 * server is present). */
export function lspLocate(
  view: EditorView,
  pos: number,
  method: "definition" | "typeDefinition" | "implementation",
  open: (path: string, line: number) => void,
  /** What to do when the server has nothing for us. Defaults to saying so —
   *  silence is what made ⌘-click feel broken. A caller with an index of its own
   *  passes that instead. */
  onMiss: () => void = () => notify("info", t("lsp.noDefinition")),
): void {
  void (async () => {
    // Ready, not merely present: a server that started and never finished
    // initializing used to be handed the request anyway, and the answer never
    // came.
    const plugin = await readyPlugin(view)
    if (!plugin) return onMiss()
    plugin.client.sync()
    try {
      const res = await plugin.client.request<unknown, LspLocation | LspLocation[] | null>(
        `textDocument/${method}`,
        { textDocument: { uri: plugin.uri }, position: plugin.toPosition(pos) },
      )
      const loc = Array.isArray(res) ? res[0] : res
      if (loc) open(fromUri(loc.uri), loc.range.start.line + 1)
      else onMiss()
    } catch (e) {
      log.warn("locate failed", { method, error: safeError(e) })
      onMiss()
    }
  })()
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

/** An LSP `SymbolInformation` (a `location`) or `WorkspaceSymbol` (a `location`
 *  that may be just a `uri`). Servers send one shape or the other. */
interface LspWorkspaceSymbol {
  name: string
  kind?: number
  containerName?: string
  location: { uri: string; range?: { start: LspPos } } | { uri: string }
}

/**
 * Ask every running language server for the project's symbols matching `query`.
 *
 * Reado's own index finds what is written literally in the project's source. A
 * server finds what a macro generated, what a dependency exports, and what is
 * spelled differently from its declaration — so the picker asks both and merges.
 * An empty answer (no server, a server that doesn't offer it, an error) is
 * nothing added, never an error shown: the index has already answered.
 */
export async function lspWorkspaceSymbols(query: string): Promise<IndexedSymbol[]> {
  const clients = await Promise.all([...conns.values()].map((p) => p.catch(() => null)))
  const answers = await Promise.all(
    clients
      .filter((c) => c !== null)
      .map(async (conn) => {
        if (!conn.client.serverCapabilities?.workspaceSymbolProvider) return []
        try {
          const res = await conn.client.request<object, LspWorkspaceSymbol[] | null>(
            "workspace/symbol",
            { query },
          )
          return res ?? []
        } catch (e) {
          log.warn("workspace/symbol failed", { error: safeError(e) })
          return []
        }
      }),
  )
  // Deduped: with two servers attached (a workspace with a TypeScript and a Rust
  // root, say) a symbol either of them can see is reported twice.
  const out = new Map<string, IndexedSymbol>()
  for (const s of answers.flat()) {
    const location = s.location as { uri: string; range?: { start: LspPos } }
    const symbol: IndexedSymbol = {
      name: s.name,
      kind: SYMBOL_KIND[s.kind ?? 0] ?? "variable",
      path: fromUri(location.uri),
      line: (location.range?.start.line ?? 0) + 1,
    }
    out.set(`${symbol.name}\u0000${symbol.path}\u0000${symbol.line}`, symbol)
  }
  return [...out.values()]
}
