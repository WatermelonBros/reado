import { LSPPlugin } from "@codemirror/lsp-client"
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
  type ViewUpdate,
} from "@codemirror/view"
import { safeError } from "@/lib/logger"
import { useSettings } from "@/lib/store"
import { log, type ServerCaps } from "./shared"

// ---- Semantic tokens --------------------------------------------------------

/**
 * Colouring from the server, laid over the grammar's.
 *
 * The grammar guesses from the shape of the text; the server knows. But Reado's
 * palette is six colours on purpose (see `codemirror.ts`), and an installed
 * theme defines those and no others — so the server's meaning is expressed with
 * the colours that already exist, and the distinctions colour should not carry
 * are carried by italics and a strike-through instead.
 *
 * Layered, not substituted: only the ranges the server names are touched, so a
 * server that answers for half a file leaves the other half exactly as it was.
 */
const SEMANTIC_CLASS: Record<string, string> = {
  // The server knows a name is a type where the grammar saw an identifier.
  type: "cm-sem-type",
  class: "cm-sem-type",
  enum: "cm-sem-type",
  interface: "cm-sem-type",
  struct: "cm-sem-type",
  typeParameter: "cm-sem-type",
  namespace: "cm-sem-type",
  function: "cm-sem-type",
  method: "cm-sem-type",
  // A parameter is the one distinction worth drawing and the one Reado has no
  // colour for: italic says it without a seventh hue.
  parameter: "cm-sem-parameter",
  keyword: "cm-sem-keyword",
  modifier: "cm-sem-keyword",
  macro: "cm-sem-keyword",
  decorator: "cm-sem-keyword",
  string: "cm-sem-string",
  number: "cm-sem-number",
  enumMember: "cm-sem-number",
  comment: "cm-sem-comment",
  operator: "cm-sem-punctuation",
}

/** How many tokens one document may colour. A generated file can report tens of
 *  thousands; past this the grammar's answer is good enough and the decoration
 *  set stops being free. */
const MAX_SEMANTIC_TOKENS = 20000

interface TokensResult {
  resultId?: string
  data?: number[]
}

/** One decoded token: where it is, and what the server called it. */
interface SemanticToken {
  line: number
  start: number
  length: number
  type: number
  modifiers: number
}

/**
 * Decode the flat encoding: five integers per token, each line/character
 * relative to the token before it. Exported for its own test — the packing is
 * the part most likely to be wrong, and it is pure arithmetic.
 */
export function decodeSemanticTokens(data: readonly number[]): SemanticToken[] {
  const out: SemanticToken[] = []
  let line = 0
  let start = 0
  for (let i = 0; i + 4 < data.length && out.length < MAX_SEMANTIC_TOKENS; i += 5) {
    const deltaLine = data[i]
    const deltaStart = data[i + 1]
    line += deltaLine
    // The character delta restarts at every new line, and continues along one.
    start = deltaLine === 0 ? start + deltaStart : deltaStart
    out.push({ line, start, length: data[i + 2], type: data[i + 3], modifiers: data[i + 4] })
  }
  return out
}

const setTokens = StateEffect.define<DecorationSet>()
const semanticField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setTokens)) return e.value
    // An edit moves every offset after it; mapping keeps the colouring on the
    // right text until the server answers again.
    return tr.docChanged ? value.map(tr.changes) : value
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** Turn decoded tokens into decorations, using the server's own legend for the
 *  type and modifier names — the numbers mean nothing without it. */
function semanticDecorations(
  state: EditorState,
  tokens: readonly SemanticToken[],
  legend: { tokenTypes?: string[]; tokenModifiers?: string[] } | undefined,
): DecorationSet {
  const types = legend?.tokenTypes ?? []
  const mods = legend?.tokenModifiers ?? []
  const deprecated = mods.indexOf("deprecated")
  const b = new RangeSetBuilder<Decoration>()
  const doc = state.doc
  for (const tok of tokens) {
    if (tok.line + 1 > doc.lines) break
    const line = doc.line(tok.line + 1)
    const from = Math.min(line.from + tok.start, line.to)
    const to = Math.min(from + tok.length, line.to)
    if (to <= from) continue
    const classes = [SEMANTIC_CLASS[types[tok.type] ?? ""]]
    // Deprecated is the one modifier worth drawing: struck through, which no
    // theme can take away and no colour blindness can hide.
    if (deprecated >= 0 && tok.modifiers & (1 << deprecated)) classes.push("cm-sem-deprecated")
    const className = classes.filter(Boolean).join(" ")
    if (!className) continue
    b.add(from, to, Decoration.mark({ class: className }))
  }
  return b.finish()
}

const semanticFetcher = ViewPlugin.fromClass(
  class {
    pending = -1
    waitingForHandshake = false
    /** The server's own id for the last answer, so it can send a delta instead
     *  of the whole file. Dropped whenever a full answer is asked for. */
    resultId: string | undefined
    /** The last decoded tokens, which a delta patches rather than replaces. */
    tokens: SemanticToken[] = []
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
        void this.fetch(view)
      }, 400)
    }
    async fetch(view: EditorView) {
      const plugin = LSPPlugin.get(view)
      if (!plugin) return
      // Capabilities arrive with the handshake; asking before it lands would be
      // skipped as unsupported and never retried. See `documentFeature`.
      if (!plugin.client.serverCapabilities) {
        if (this.waitingForHandshake) return
        this.waitingForHandshake = true
        plugin.client.initializing.then(
          () => this.schedule(view),
          () => {},
        )
        return
      }
      const caps = plugin.client.serverCapabilities as ServerCaps
      const provider = caps?.semanticTokensProvider
      if (!provider?.full || !useSettings.getState().semanticTokens) return
      const before = view.state.doc
      plugin.client.sync()
      const wantsDelta =
        typeof provider.full === "object" && provider.full.delta && this.resultId !== undefined
      try {
        const res = wantsDelta
          ? await plugin.client.request<object, (TokensResult & { edits?: unknown }) | null>(
              "textDocument/semanticTokens/full/delta",
              { textDocument: { uri: plugin.uri }, previousResultId: this.resultId },
            )
          : await plugin.client.request<object, TokensResult | null>(
              "textDocument/semanticTokens/full",
              { textDocument: { uri: plugin.uri } },
            )
        if (view.state.doc !== before) return
        // A delta answer we cannot use (the server sent edits rather than data)
        // is not an error — ask for the whole file next time.
        if (!res || !Array.isArray(res.data)) {
          if (wantsDelta) {
            this.resultId = undefined
            this.schedule(view)
          }
          return
        }
        this.resultId = res.resultId
        this.tokens = decodeSemanticTokens(res.data)
        view.dispatch({
          effects: setTokens.of(semanticDecorations(view.state, this.tokens, provider.legend)),
        })
      } catch (e) {
        this.resultId = undefined
        log.warn("semanticTokens failed", { error: safeError(e) })
      }
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending)
    }
  },
)

export const semanticTokens = (): Extension => [semanticField, semanticFetcher]
