/**
 * TextMate grammars contributed by installed extensions.
 *
 * Reado highlights with CodeMirror's own language packs wherever it has one:
 * they produce a syntax tree, and the outline, focus block, syntax-aware
 * selection and nesting cues all read that tree. A grammar produces a stream of
 * scoped tokens and nothing else — good for colour, useless for structure — so
 * it is strictly the fallback for languages with no pack at all.
 *
 * Everything here is bounded on purpose. Grammar patterns arrive from untrusted
 * packages and the format is famous for catastrophic backtracking, so the
 * tokenizer runs against a time limit per pass, skips lines beyond a length
 * cap, and only ever works on the visible region. When a budget runs out the
 * file renders as plain text; the editor never stops answering.
 */

import type { Extension } from "@codemirror/state"
import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"
import type { IGrammar, StateStack } from "vscode-textmate"
import { extRead, type InstalledExt } from "./api"
import { themeForegroundForScopes } from "./extThemes"
import { createLogger } from "./logger"
import { enabledExtensions, useMarketplace } from "./marketplace"

const log = createLogger("extGrammars")

/** Give up on a line that takes longer than this (milliseconds, per line). */
const LINE_TIME_LIMIT = 20
/** Total tokenizing budget for one pass over the viewport. */
const PASS_TIME_LIMIT = 60
/** Beyond this, a line is left as plain text — a minified bundle is not code
 *  anyone is reading, and it is exactly what makes a grammar catastrophic. */
const MAX_LINE = 2000
/** How far back the tokenizer will re-run to recover a line's starting state
 *  before giving up and starting the viewport from scratch. */
const MAX_CATCHUP_LINES = 3000

interface GrammarContribution {
  language?: string
  scopeName?: string
  path?: string
}

/** scopeName → where its grammar file lives. */
export function grammarIndex(
  installed: InstalledExt[],
): Map<string, { ext: InstalledExt; path: string }> {
  const index = new Map<string, { ext: InstalledExt; path: string }>()
  for (const ext of installed) {
    const list = (ext.manifest.contributes?.grammars as GrammarContribution[] | undefined) ?? []
    for (const g of list) {
      if (g.scopeName && g.path) index.set(g.scopeName, { ext, path: g.path })
    }
  }
  return index
}

/** The root scope a contributed grammar claims for `languageId`. */
export function scopeForLanguage(installed: InstalledExt[], languageId: string): string | null {
  for (const ext of installed) {
    const list = (ext.manifest.contributes?.grammars as GrammarContribution[] | undefined) ?? []
    const match = list.find((g) => g.language === languageId && g.scopeName && g.path)
    if (match?.scopeName) return match.scopeName
  }
  return null
}

// ---------------------------------------------------------------------------
// The engine, loaded on demand
// ---------------------------------------------------------------------------

/**
 * The registry, built the first time a file actually needs a grammar.
 *
 * The regex engine is a WebAssembly module, which is why the app's CSP carries
 * `'wasm-unsafe-eval'` in `script-src` (Chromium-based webviews block
 * `WebAssembly.instantiate` without it). It is loaded on demand rather than at
 * startup: most sessions never open a file that needs a contributed grammar,
 * and they should not pay for one.
 */
let registryPromise: Promise<import("vscode-textmate").Registry> | null = null

/** The engine's "start of file" rule stack, captured when it loads. */
let initialStack: StateStack | null = null

async function registry() {
  if (registryPromise) return registryPromise
  registryPromise = (async () => {
    const [oniguruma, textmate, wasmUrl] = await Promise.all([
      import("vscode-oniguruma"),
      import("vscode-textmate"),
      import("vscode-oniguruma/release/onig.wasm?url").then((m) => m.default as string),
    ])
    await oniguruma.loadWASM({ data: await fetch(wasmUrl).then((r) => r.arrayBuffer()) })
    initialStack = textmate.INITIAL
    return new textmate.Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (p: string[]) => oniguruma.createOnigScanner(p),
        createOnigString: (s: string) => oniguruma.createOnigString(s),
      }),
      loadGrammar: async (scopeName: string) => {
        const found = grammarIndex(enabledExtensions(useMarketplace.getState().installed)).get(
          scopeName,
        )
        if (!found) return null
        try {
          const raw = await extRead(found.ext.namespace, found.ext.name, found.path)
          return textmate.parseRawGrammar(raw, found.path)
        } catch (e) {
          log.warn("could not read a grammar", { scopeName, error: String(e) })
          return null
        }
      },
    })
  })()
  registryPromise.catch(() => {
    registryPromise = null // a failed load must not poison every later file
  })
  return registryPromise
}

/** Grammars already built, by root scope. */
const grammars = new Map<string, IGrammar | null>()

async function grammarFor(scopeName: string): Promise<IGrammar | null> {
  const hit = grammars.get(scopeName)
  if (hit !== undefined) return hit
  try {
    const grammar = await (await registry()).loadGrammar(scopeName)
    grammars.set(scopeName, grammar)
    return grammar
  } catch (e) {
    log.warn("could not build a grammar", { scopeName, error: String(e) })
    grammars.set(scopeName, null)
    return null
  }
}

// ---------------------------------------------------------------------------
// Scopes → colour
// ---------------------------------------------------------------------------

/**
 * Reado's semantic palette, expressed as the scopes that carry each role.
 *
 * This is the fallback path — used when a built-in Reado theme is active, which
 * has no scope rules of its own. It keeps grammar-highlighted files in the same
 * six colours as every other file rather than importing another editor's idea
 * of a palette.
 */
const SEMANTIC: Array<[prefix: string, token: string]> = [
  ["comment", "syn-comment"],
  ["string", "syn-string"],
  ["constant.numeric", "syn-number"],
  ["constant", "syn-number"],
  ["keyword.control", "syn-control"],
  ["keyword.operator", "syn-punctuation"],
  ["keyword", "syn-keyword"],
  ["storage", "syn-keyword"],
  ["entity.name", "syn-definition"],
  ["entity.other.attribute-name", "syn-definition"],
  ["support.function", "syn-definition"],
  ["support.class", "syn-definition"],
  ["support.type", "syn-definition"],
  ["punctuation", "syn-punctuation"],
]

/**
 * Colours by scope-tuple, so a theme's rules are scanned once per distinct
 * token shape rather than once per token.
 *
 * A published theme carries hundreds of scope selectors and `highlight` runs on
 * every keystroke and scroll frame, so the uncached form spent most of the
 * pass's time budget re-deriving answers it had already found. Scope tuples
 * repeat constantly inside one file, so the hit rate is near total. Cleared
 * with the theme, since the answers depend on it.
 */
const colorCache = new Map<string, string | null>()

/** Forget the cached colours — the active theme decided them. */
export function forgetScopeColors(): void {
  colorCache.clear()
}

/** The colour for a token's scopes: the active contributed theme's own rule if
 *  there is one, otherwise Reado's semantic palette. */
export function colorForScopes(scopes: readonly string[]): string | null {
  const key = scopes.join(" ")
  const hit = colorCache.get(key)
  if (hit !== undefined) return hit
  const color = resolveColorForScopes(scopes)
  colorCache.set(key, color)
  return color
}

function resolveColorForScopes(scopes: readonly string[]): string | null {
  const themed = themeForegroundForScopes(scopes)
  if (themed) return themed
  // Innermost scope first: `keyword.control.flow.ts` should be control flow,
  // not whatever its outer `source.ts` maps to.
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]
    for (const [prefix, token] of SEMANTIC) {
      if (scope === prefix || scope.startsWith(`${prefix}.`)) return `var(--${token})`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// The editor plugin
// ---------------------------------------------------------------------------

/** Reusable marks, so a long file doesn't allocate one decoration per token. */
const marks = new Map<string, Decoration>()
const markFor = (color: string) => {
  let mark = marks.get(color)
  if (!mark) {
    mark = Decoration.mark({ attributes: { style: `color:${color}` } })
    marks.set(color, mark)
  }
  return mark
}

/**
 * Highlight the visible region with `grammar`.
 *
 * Rule stacks are kept per line so scrolling and editing re-tokenize from the
 * nearest known state rather than from the top of the file. When that state is
 * too far back to recover cheaply, the viewport is tokenized from scratch: a
 * multi-line string opened thousands of lines above may be mis-coloured, which
 * is a better failure than a locked window.
 */
function highlight(
  view: EditorView,
  grammar: IGrammar,
  scopeName: string,
  stacks: (StateStack | null)[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const started = performance.now()
  let abandoned = false

  for (const { from, to } of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(from).number
    const endLine = view.state.doc.lineAt(to).number

    // Walk back to the nearest line whose ending state we already know.
    let known = startLine - 1
    while (known > 0 && stacks[known] === undefined) known--
    const catchUpFrom = startLine - known > MAX_CATCHUP_LINES ? startLine : known + 1
    let stack = catchUpFrom === startLine ? initialStack : (stacks[known] ?? initialStack)

    for (let n = catchUpFrom; n <= endLine; n++) {
      const line = view.state.doc.line(n)
      if (line.length > MAX_LINE || performance.now() - started > PASS_TIME_LIMIT) {
        // Out of budget: leave the rest as plain text rather than stall. Logged
        // once per pass and named, so a grammar that always blows the budget is
        // attributable to the extension that shipped it.
        if (!abandoned) {
          abandoned = true
          log.warn("gave up highlighting part of the viewport", {
            scope: scopeName,
            reason: line.length > MAX_LINE ? "line too long" : "time budget",
            line: n,
          })
        }
        stacks[n] = stack
        continue
      }
      const result = grammar.tokenizeLine(line.text, stack, LINE_TIME_LIMIT)
      stack = result.ruleStack
      stacks[n] = stack
      if (n < startLine) continue // catching up; nothing to paint yet
      for (const token of result.tokens) {
        const color = colorForScopes(token.scopes)
        if (!color || token.startIndex >= token.endIndex) continue
        builder.add(line.from + token.startIndex, line.from + token.endIndex, markFor(color))
      }
    }
  }
  return builder.finish()
}

/** The highlighting plugin for one grammar. */
function grammarPlugin(grammar: IGrammar, scopeName: string): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      /** Ending rule stack per line number; sparse, filled as lines are seen. */
      stacks: (StateStack | null)[] = []

      constructor(view: EditorView) {
        this.decorations = highlight(view, grammar, scopeName, this.stacks)
      }

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.viewportChanged) return
        if (update.docChanged) {
          // Everything from the first edited line on is stale; earlier states
          // still hold, which is what keeps editing cheap in a long file.
          let first = Number.POSITIVE_INFINITY
          update.changes.iterChangedRanges((fromA) => {
            first = Math.min(first, update.startState.doc.lineAt(fromA).number)
          })
          if (Number.isFinite(first)) this.stacks.length = Math.max(0, first - 1)
        }
        this.decorations = highlight(update.view, grammar, scopeName, this.stacks)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

/**
 * The grammar highlighter for a file, or nothing.
 *
 * Async because building a grammar means reading and compiling it; the caller
 * reconfigures the editor once it resolves, so a file opens immediately as
 * plain text and gains colour a moment later.
 */
export async function grammarSupport(languageId: string): Promise<Extension | null> {
  const installed = enabledExtensions(useMarketplace.getState().installed)
  const scopeName = scopeForLanguage(installed, languageId)
  if (!scopeName) return null
  const grammar = await grammarFor(scopeName)
  return grammar ? grammarPlugin(grammar, scopeName) : null
}

/** Whether any installed extension has a grammar for this language (cheap:
 *  manifest only, nothing loaded). */
export const hasGrammar = (languageId: string) =>
  scopeForLanguage(enabledExtensions(useMarketplace.getState().installed), languageId) !== null

/**
 * Drop the grammars an extension compiled.
 *
 * A compiled grammar holds oniguruma scanners, and the cache is keyed on scope
 * name — which an update keeps. Called when the installed set changes so a
 * reinstall doesn't get the old one back.
 */
export function forgetGrammars(extId?: string): void {
  if (!extId) {
    grammars.clear()
    return
  }
  for (const [scope, found] of grammarIndex(useMarketplace.getState().installed)) {
    if (found.ext.id === extId) grammars.delete(scope)
  }
}
