import { getIndentUnit, indentUnit } from "@codemirror/language"
import { forEachDiagnostic } from "@codemirror/lint"
import { LSPPlugin } from "@codemirror/lsp-client"
import type { EditorState, Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { t } from "@/i18n"
import { type Backup, readFile, writeBacked } from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { useFileUndo } from "@/lib/fileUndo"
import { safeError } from "@/lib/logger"
import { notify } from "@/lib/notice"
import { prompt } from "@/lib/prompt"
import { noteSelfWrite } from "@/lib/readProgress"
import { useSettings } from "@/lib/store"
import { rootFor } from "@/lib/workspace"
import { fromUri, type LspDiag, type LspPos, type LspTextEdit, log } from "./shared"

// ---- Formatting as you type -------------------------------------------------

/** What a server advertises for `textDocument/onTypeFormatting`. */
interface OnTypeCaps {
  firstTriggerCharacter: string
  moreTriggerCharacter?: string[]
}

/** The formatting options every format request carries: the document's own
 *  indentation, as the editor has it. */
const formatOptions = (state: EditorState) => ({
  tabSize: getIndentUnit(state),
  insertSpaces: !state.facet(indentUnit).includes("\t"),
})

/**
 * Re-format around the cursor after a character the server asked to be told
 * about — the closing brace that should pull its line back out a level, the
 * semicolon that ends a statement.
 *
 * Off unless the user turns it on, and silent when the server doesn't offer it:
 * typing is the one place where a surprise edit is least welcome.
 */
export function onTypeFormatting(): Extension {
  return EditorView.updateListener.of((u) => {
    if (!u.docChanged || !useSettings.getState().formatOnType) return
    const plugin = LSPPlugin.get(u.view)
    const caps = plugin?.client.serverCapabilities?.documentOnTypeFormattingProvider as
      | OnTypeCaps
      | undefined
    if (!plugin || !caps) return
    const triggers = new Set([caps.firstTriggerCharacter, ...(caps.moreTriggerCharacter ?? [])])
    let typed: { ch: string; pos: number } | null = null
    for (const tr of u.transactions) {
      if (!tr.isUserEvent("input.type")) continue
      tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
        const text = inserted.toString()
        if (text.length === 1 && triggers.has(text)) typed = { ch: text, pos: toB }
      })
    }
    if (typed) void formatOnType(u.view, plugin, typed)
  })
}

async function formatOnType(
  view: EditorView,
  plugin: LSPPlugin,
  typed: { ch: string; pos: number },
): Promise<void> {
  const before = view.state.doc
  try {
    plugin.client.sync()
    const edits = await plugin.client.request<object, LspTextEdit[] | null>(
      "textDocument/onTypeFormatting",
      {
        textDocument: { uri: plugin.uri },
        position: plugin.toPosition(typed.pos, before),
        ch: typed.ch,
        options: formatOptions(view.state),
      },
    )
    // The user types faster than a server answers. Offsets computed against a
    // document that has moved on would corrupt it.
    if (!edits?.length || view.state.doc !== before) return
    view.dispatch({
      changes: edits.map((e) => ({
        from: plugin.fromPosition(e.range.start, before),
        to: plugin.fromPosition(e.range.end, before),
        insert: e.newText,
      })),
      userEvent: "format.onType",
    })
  } catch (e) {
    log.warn("on-type formatting failed", { error: safeError(e) })
  }
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
 *
 * Returns how many files it changed, so a caller can say so: a rename that
 * reports "5 files" is a rename you can trust, and one that reports "1" tells
 * you the server only found the one.
 */
async function applyWorkspaceEdit(plugin: LSPPlugin, edit: LspWorkspaceEdit): Promise<number> {
  const byUri: Record<string, LspTextEdit[]> = { ...(edit.changes ?? {}) }
  for (const change of edit.documentChanges ?? []) {
    byUri[change.textDocument.uri] = [
      ...(byUri[change.textDocument.uri] ?? []),
      ...(change.edits ?? []),
    ]
  }
  const backups: Backup[] = []
  let changed = 0
  for (const [uri, edits] of Object.entries(byUri)) {
    if (!edits.length) continue
    changed++
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
  return changed
}

/** The three shapes a server may answer `textDocument/prepareRename` with. */
type PrepareRename =
  | { start: LspPos; end: LspPos }
  | { range: { start: LspPos; end: LspPos }; placeholder?: string }
  | { defaultBehavior: boolean }
  | null

/**
 * The range the server would rename, asked before anyone is prompted.
 *
 * `wordAt()` decides what a symbol is from the text alone, and a word is letters
 * and underscores: on `@Component` it picks `Component`, on `$scope` it picks
 * `scope`, on a CSS `--brand-color` one fragment of three. The server knows the
 * real range, and knows when there isn't one.
 *
 * `"refused"` is the server saying this position cannot be renamed; `null` is
 * "no answer to use" — no prepare support, an error, or `defaultBehavior`, all of
 * which mean the word guess stands.
 */
async function preparedRange(
  plugin: LSPPlugin,
  pos: number,
): Promise<{ from: number; to: number } | "refused" | null> {
  const rename = (
    plugin.client.serverCapabilities as {
      renameProvider?: boolean | { prepareProvider?: boolean }
    } | null
  )?.renameProvider
  if (typeof rename !== "object" || !rename?.prepareProvider) return null
  try {
    const res = await plugin.client.request<object, PrepareRename>("textDocument/prepareRename", {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    if (res === null) return "refused"
    const range = res && "range" in res ? res.range : res && "start" in res ? res : null
    if (!range) return null
    return { from: plugin.fromPosition(range.start), to: plugin.fromPosition(range.end) }
  } catch (e) {
    log.warn("prepareRename failed", { error: safeError(e) })
    return null
  }
}

/**
 * Rename the symbol at the cursor — everywhere it is used, not just here.
 *
 * This replaces `@codemirror/lsp-client`'s own `renameSymbol`, which applies the
 * server's answer through `workspace.getFile(uri)` and skips any URI that
 * returns null. The default workspace only knows files with an editor attached,
 * so a project-wide rename silently renamed the tabs you happened to have open
 * and left every other call site on the old name — no error, no count, nothing
 * to notice until something failed to compile.
 *
 * Reado already had the machinery for the other half: `applyWorkspaceEdit` is
 * what code actions use, and it rewrites closed files through the backend and
 * parks a backup of each. Rename goes through it too, so the whole thing is one
 * ⌘Z — and it says how many files it touched, because a rename you cannot see
 * the extent of is a rename you have to go and verify by hand.
 */
export function renameSymbolAt(view: EditorView): boolean {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return false
  // Capabilities are null until the server has answered `initialize`; only a
  // server that has answered and said no is a server that can't rename.
  const caps = plugin.client.serverCapabilities
  if (caps && !caps.renameProvider) return false
  const head = view.state.selection.main.head
  const word = view.state.wordAt(head)
  if (!word) return false
  void (async () => {
    // Ask the server what it would rename before asking the user for a name: a
    // refusal that arrives after the prompt is a question that was never worth
    // asking, and a range that disagrees with the server renames the wrong text.
    const prepared = await preparedRange(plugin, head)
    if (prepared === "refused") {
      notify("info", t("lsp.renameRefused"))
      return
    }
    const range = prepared ?? word
    const current = view.state.sliceDoc(range.from, range.to)
    const next = await prompt({
      title: t("lsp.renameTitle", { name: current }),
      value: current,
      confirmLabel: t("lsp.renameConfirm"),
    })
    if (!next || next === current) return
    plugin.client.sync()
    try {
      const edit = await plugin.client.request<object, LspWorkspaceEdit | null>(
        "textDocument/rename",
        {
          textDocument: { uri: plugin.uri },
          position: plugin.toPosition(range.from),
          newName: next,
        },
      )
      // A server declines a rename it cannot do safely (a keyword, a symbol from
      // a dependency) by answering with nothing rather than by failing.
      if (!edit) {
        notify("info", t("lsp.renameRefused"))
        return
      }
      const files = await applyWorkspaceEdit(plugin, edit)
      notify("success", t("lsp.renamed", { name: next, count: files }))
    } catch (e) {
      log.warn("rename failed", { error: String(e) })
      notify("error", t("lsp.renameFailed"))
    }
  })()
  return true
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
