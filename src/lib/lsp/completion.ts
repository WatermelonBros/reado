import {
  type Completion,
  type CompletionContext,
  type CompletionSource,
  insertCompletionText,
  snippet,
} from "@codemirror/autocomplete"
import { LSPPlugin } from "@codemirror/lsp-client"
import { EditorState } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { renderHoverDoc } from "./hover"
import { type LspPos, type LspTextEdit, log } from "./shared"

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
  // And nothing to ask: a server that did not advertise `completionProvider.
  // resolveProvider` has no handler for this, and answers by printing
  // "Method not implemented" on its own stderr — which Reado relays, so the
  // `.catch` below cannot keep it out of the log. Same rule as code lenses.
  const completion = plugin.client.serverCapabilities?.completionProvider as
    | { resolveProvider?: boolean }
    | undefined
  if (!completion?.resolveProvider) return
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
/**
 * Whether this view has a language server that has actually answered.
 *
 * Not just "a plugin object exists": a server that started and then failed to
 * initialize leaves the plugin in place with no capabilities, and this used to
 * report it as attached. That is not academic — `snippetSupport` turns off
 * word-based completion whenever a server is attached, so a dead server left the
 * user with no completions at all instead of falling back.
 *
 * `serverCapabilities` is null until `initialize` comes back, so this is also
 * false for the moment before a healthy server is ready — which is correct: it
 * cannot answer yet either.
 */
export const lspAttached = (view: EditorView) =>
  LSPPlugin.get(view)?.client.serverCapabilities != null
