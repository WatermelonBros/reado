import { autocompletion } from "@codemirror/autocomplete"
import { historyField } from "@codemirror/commands"
import { bracketMatching, indentUnit, LanguageDescription } from "@codemirror/language"
import { forEachDiagnostic } from "@codemirror/lint"
import { selectSelectionMatches } from "@codemirror/search"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, highlightWhitespace } from "@codemirror/view"
import {
  readText as clipboardReadText,
  writeText as clipboardWriteText,
} from "@tauri-apps/plugin-clipboard-manager"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ContextMenu } from "@/components/atoms/ContextMenu"
import { CommentComposer } from "@/components/organisms/CommentComposer"
import { CommentThread } from "@/components/organisms/CommentThread"
import { type RibbonMark, StructureRibbon } from "@/components/organisms/StructureRibbon"
import type { MessageKey } from "@/i18n"
import { dispatchToAgent } from "@/lib/agents"
import {
  type Comment,
  type CommentType,
  type Context,
  type EditorConfig as EditorConfigProps,
  editorConfigFor,
  findDefinition,
  gitBlame,
  gitWorkingDiffLines,
  readFile,
  writeFile,
} from "@/lib/api"
import { blameGutter, inlineBlame } from "@/lib/blameGutter"
import { bookmarkGutter } from "@/lib/bookmarkGutter"
import { useBookmarks } from "@/lib/bookmarks"
import { bracketColors } from "@/lib/bracketColors"
import { changedLinesHighlight, diffGutter } from "@/lib/changedLines"
import {
  actionsAtCursor,
  GROUP_LABEL,
  groupOf,
  organizeImports,
  runAction,
} from "@/lib/codeActions"
import { colorSwatches, type SwatchHit } from "@/lib/colorSwatch"
import { commentGutter, type LineComments } from "@/lib/commentGutter"
import { toRelative, useComments } from "@/lib/comments"
import { useDiagnostics } from "@/lib/diagnostics"
import {
  applyEol,
  applyHygiene,
  compareWithSaved,
  detectEol,
  detectIndent,
  type Eol,
  encodingFor,
  eolFor,
  formatDocument,
  setEditorConfig as recordEditorConfig,
  registerView,
  saveAs,
  textToSave,
  useDocInfo,
} from "@/lib/docInfo"
import { grammarSupport } from "@/lib/extGrammars"
import { resolvedLanguageId } from "@/lib/extLanguages"
import { languages } from "@/lib/languages"
import { createLogger, safeError } from "@/lib/logger"
import {
  fileSaved,
  hasServer,
  lspDefinition,
  lspHover,
  lspSupport,
  type ResolvedAction,
  renameSymbolAt,
  useLspServers,
} from "@/lib/lsp"
import { enabledExtensions, useMarketplace } from "@/lib/marketplace"
import { notify } from "@/lib/notice"
import { extractSymbols } from "@/lib/outline"
import { noteSelfWrite, useReadProgress } from "@/lib/readProgress"
import { composeExplainPrompt, composeSymbolExplainPrompt } from "@/lib/review"
import {
  clampRange,
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  useEditorActions,
  useProject,
  useSessions,
  useSettings,
} from "@/lib/store"
import { testGutter } from "@/lib/testGutter"
import { runTests, type TestStatus, testId, useTesting } from "@/lib/testing"
import { isUntitled, useUntitled } from "@/lib/untitled"
import { rootFor } from "@/lib/workspace"
import { buildCodeExtensions } from "./buildCodeExtensions"
import {
  AddCommentButton,
  type PeekInfo,
  PeekPanel,
  ReanchorBar,
  SaveErrorBanner,
  StickyHeaders,
  ThreadConnector,
} from "./CodeOverlays"
import { ColorPickerPopover } from "./ColorPickerPopover"
import {
  activeLineExt,
  ExternalReload,
  findReferencesAt,
  focusExtension,
  goToDefinitionAt,
  goToImplementationAt,
  goToTypeDefinitionAt,
  indentGuidesExt,
  lineNumbersExt,
  rulerExt,
  setBlock,
  setLanding,
  useReconfigure,
  wrapExt,
} from "./extensions"

const log = createLogger("editor")

/**
 * Undo histories of files whose editor was torn down.
 *
 * A tab switch remounts CodeView (the `key` in Editor), so the EditorState —
 * and with it the whole undo stack — is thrown away. VS Code keeps ⌘Z working
 * across tab switches; parking the serialized history here restores that, and
 * it is re-applied only when the file comes back byte-identical, so undo can
 * never replay against a document someone else changed meanwhile.
 *
 * Bounded: a handful of histories is cheap, one per file ever opened is not.
 */
const parkedHistory = new Map<string, { doc: string }>()
const PARK_LIMIT = 12

function parkHistory(path: string, state: EditorState): void {
  parkedHistory.delete(path) // re-insert so the map stays in least-recent order
  parkedHistory.set(path, state.toJSON({ history: historyField }))
  if (parkedHistory.size > PARK_LIMIT) {
    const oldest = parkedHistory.keys().next().value
    if (oldest !== undefined) parkedHistory.delete(oldest)
  }
}

interface CodeViewProps {
  path: string
  relPath: string
  text: string
  comments: Comment[]
  wrap: boolean
  /** Column a wrapped line breaks at; 0 means the editor's edge. */
  wrapColumn: number
  codeFont: string
  focusMode: boolean
  renderWhitespace: boolean
  landingLine: { line: number; nonce: number } | null
  /** Whether this is the primary pane (owns shared status-bar/cursor state). */
  primary: boolean
  /** Content is pinned to a git ref (PR review) — read-only, never saved to disk. */
  pinned: boolean
  /** Head-side line ranges the PR changed, to mark inline (empty when not a PR). */
  changedLines: Array<[number, number]>
  /** The charset the file was decoded with, and the one a save writes back.
   *  Absent means UTF-8. */
  encoding?: string
}

/** The CodeMirror-backed read-only code viewer, with the comment overlay. */
export function CodeView({
  path,
  relPath,
  text,
  comments,
  primary,
  wrap,
  wrapColumn,
  codeFont,
  focusMode,
  renderWhitespace,
  landingLine,
  pinned,
  changedLines,
  encoding,
}: CodeViewProps) {
  // The workspace folder this file belongs to. Resolved once, here: reading
  // "the project's root" from the store at each call site is right only while
  // there is one folder open, and silently resolves a second folder's file
  // against the first as soon as there are two.
  const fileRoot = useMemo(() => rootFor(path), [path])
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const autoSaveTimer = useRef<number | undefined>(undefined)
  const cursorSaveTimer = useRef<number | undefined>(undefined)
  const wrapComp = useMemo(() => new Compartment(), [])
  const colorComp = useMemo(() => new Compartment(), [])
  const bracketColorComp = useMemo(() => new Compartment(), [])
  const whitespaceComp = useMemo(() => new Compartment(), [])
  const langComp = useMemo(() => new Compartment(), [])
  const focusComp = useMemo(() => new Compartment(), [])
  const gutterComp = useMemo(() => new Compartment(), [])
  const blameComp = useMemo(() => new Compartment(), [])
  const bookmarkComp = useMemo(() => new Compartment(), [])
  const testComp = useMemo(() => new Compartment(), [])
  const tabSizeComp = useMemo(() => new Compartment(), [])
  const indentUnitComp = useMemo(() => new Compartment(), [])
  const lspComp = useMemo(() => new Compartment(), [])
  const completionComp = useMemo(() => new Compartment(), [])
  // Changes when a language server is installed, so the open file can pick it up.
  const serversNonce = useLspServers((s) => s.nonce)
  const changedComp = useMemo(() => new Compartment(), [])
  const diffComp = useMemo(() => new Compartment(), [])
  const blame = useEditorActions((s) => s.blame)
  const inlineBlameOn = useSettings((s) => s.inlineBlame)
  const diffGutterOn = useSettings((s) => s.diffGutter)
  const indentSize = useDocInfo((s) => s.indentSize)
  const indentKind = useDocInfo((s) => s.indentKind)
  const languageOverride = useDocInfo((s) => s.languageOverride)
  const stickyScroll = useSettings((s) => s.stickyScroll)
  const colorSwatchesOn = useSettings((s) => s.colorSwatches)
  // The swatch that was clicked, and so the literal a picker would rewrite.
  const [pickingColor, setPickingColor] = useState<SwatchHit | null>(null)
  // Reading controls (clamped numerics apply as CSS vars; the rest as compartments).
  const fontSize = useSettings((s) => clampRange(s.fontSize, FONT_SIZE_RANGE))
  const lineHeight = useSettings((s) => clampRange(s.lineHeight, LINE_HEIGHT_RANGE))
  const letterSpacing = useSettings((s) => clampRange(s.letterSpacing, LETTER_SPACING_RANGE))
  const lineNumbersMode = useSettings((s) => s.lineNumbers)
  const activeLineMode = useSettings((s) => s.activeLine)
  const indentGuidesMode = useSettings((s) => s.indentGuides)
  const bracketMatchingOn = useSettings((s) => s.bracketMatching)
  const bracketColorsOn = useSettings((s) => s.bracketPairColors)
  const rulerColumn = useSettings((s) => s.rulerColumn)
  /** What `.editorconfig` says about this file, once it has been read. */
  const [editorConfig, setEditorConfig] = useState<EditorConfigProps | null>(null)
  const cursorStyle = useSettings((s) => s.cursorStyle)
  const cursorBlink = useSettings((s) => s.cursorBlink)
  const scrollbar = useSettings((s) => s.scrollbar)
  const suggestOnTyping = useSettings((s) => s.suggestOnTyping)
  const inlineDiagnostics = useSettings((s) => s.inlineDiagnostics)
  const lineNumbersComp = useMemo(() => new Compartment(), [])
  const activeLineComp = useMemo(() => new Compartment(), [])
  const indentGuidesComp = useMemo(() => new Compartment(), [])
  const bracketComp = useMemo(() => new Compartment(), [])
  const rulerComp = useMemo(() => new Compartment(), [])
  const setActiveThread = useComments((s) => s.setActive)
  const activeId = useComments((s) => s.activeId)
  const reanchoringId = useComments((s) => s.reanchoringId)
  const applyReanchor = useComments((s) => s.applyReanchor)
  const cancelReanchor = useComments((s) => s.cancelReanchor)
  const composeNonce = useEditorActions((s) => s.composeNonce)
  const reanchorLabel = useComments((s) => {
    const c = s.comments.find((x) => x.id === s.reanchoringId)
    return c?.messages[0]?.body.split("\n")[0] ?? ""
  })
  const lastComposeNonce = useRef(composeNonce)
  const explainNonce = useEditorActions((s) => s.explainNonce)
  const peekNonce = useEditorActions((s) => s.peekNonce)
  const quickFixNonce = useEditorActions((s) => s.quickFixNonce)
  const lastExplainNonce = useRef(explainNonce)
  const lastPeekNonce = useRef(peekNonce)
  const lastQuickFixNonce = useRef(quickFixNonce)
  const { t } = useTranslation()

  // Comment-overlay state, local to this file's view.
  const [composer, setComposer] = useState<{
    startLine: number
    endLine: number
    context: Context
    initialBody?: string
    initialType?: CommentType
  } | null>(null)
  // Line under the mouse, for the hover "+" add-comment affordance.
  const [hover, setHover] = useState<{ line: number; top: number } | null>(null)
  // Right-click context menu (screen position + the document offset clicked).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: number } | null>(null)
  // Sticky scroll: the enclosing scope headers pinned above the viewport top.
  const [sticky, setSticky] = useState<{ line: number; text: string }[]>([])
  // Peek definition: an inline preview of where the symbol at the cursor is
  // defined, without navigating away.
  const [peek, setPeek] = useState<PeekInfo | null>(null)
  // The code-action menu (⌘.), anchored under the cursor.
  const [actionMenu, setActionMenu] = useState<{
    x: number
    y: number
    actions: ResolvedAction[]
  } | null>(null)
  // The locations a clicked code lens carried, offered at the click point.
  const [lensMenu, setLensMenu] = useState<{
    x: number
    y: number
    locations: Array<{ path: string; line: number }>
  } | null>(null)
  // Bumped on scroll/resize so the overlays re-read their anchor coordinates.
  const [, setTick] = useState(0)
  // A failed write (read-only file, permission, disk full). Surfaced as a small
  // dismissable banner so a save error is never swallowed silently.
  const [saveError, setSaveError] = useState(false)

  // Group comments by their anchored start line for the gutter. A line is shown
  // "done" (green) only when every comment on it is resolved.
  const lineComments = useMemo<LineComments>(() => {
    const map: LineComments = new Map()
    for (const c of comments) {
      if (c.anchor.scope !== "range") continue
      // An orphan keeps its stale startLine; never position it as an authoritative
      // gutter anchor (a "wrong line"). It's surfaced in the Orphans panel instead.
      if (c.orphan) continue
      const line = c.anchor.startLine
      const entry = map.get(line) ?? { ids: [], done: true }
      entry.ids.push(c.id)
      entry.done = entry.done && (c.state === "done" || c.state === "discarded")
      map.set(line, entry)
    }
    return map
  }, [comments])

  // Reading bookmarks for this file → quiet gutter pins; clicking the gutter
  // toggles a bookmark (distinct from comments — no annotation, never sent to AI).
  const bookmarks = useBookmarks((s) => s.bookmarks)
  const bookmarkLines = useMemo(() => {
    const set = new Set<number>()
    for (const b of bookmarks) if (b.path === relPath) set.add(b.line)
    return set
  }, [bookmarks, relPath])
  // The tests declared in this file, and how each last went — the gutter's run
  // arrow and its tint. Discovery already walked the project; this is a lookup.
  const testFiles = useTesting((s) => s.files)
  const testResults = useTesting((s) => s.byRoot[fileRoot])
  const fileTests = useMemo(() => testFiles.find((f) => f.path === relPath), [testFiles, relPath])
  const testLines = useMemo(() => {
    const map = new Map<number, TestStatus | undefined>()
    for (const test of fileTests?.tests ?? [])
      map.set(test.line, testResults?.[testId(relPath, test.suites, test.name)]?.status)
    return map
  }, [fileTests, testResults, relPath])
  const runTestAtLine = useMemo(
    () => (line: number) => {
      const test = fileTests?.tests.find((x) => x.line === line)
      if (!fileTests || !test) return
      void runTests({
        framework: fileTests.framework,
        file: fileTests.path,
        suites: test.suites,
        name: test.name,
      })
    },
    [fileTests],
  )

  const toggleBookmarkLine = useMemo(
    () => (line: number) => {
      const view = viewRef.current
      if (!view) return
      const snippet = view.state.doc.line(line).text.trim().slice(0, 120)
      useBookmarks.getState().toggle(fileRoot, { path: relPath, line, snippet })
    },
    [relPath],
  )

  // Structure ribbon: marks for symbols, comment anchors, and diagnostics.
  const showRibbon = useSettings((s) => s.showRibbon)
  const diagByFile = useDiagnostics((s) => s.byFile[path])
  const totalLines = useMemo(() => text.split("\n").length, [text])
  const ribbonMarks = useMemo<RibbonMark[]>(() => {
    const out: RibbonMark[] = []
    for (const s of extractSymbols(text)) out.push({ line: s.line, kind: "symbol" })
    for (const c of comments) {
      // Skip orphans: their stale startLine must not draw a ribbon mark (a "wrong line").
      if (c.anchor.scope === "range" && !c.orphan)
        out.push({ line: c.anchor.startLine, kind: "comment" })
    }
    // Skip diagnostics for a PR-pinned file: the LSP is off for it (its bytes
    // don't match the on-disk workspace), so any store entry is stale/misleading.
    for (const d of pinned ? [] : (diagByFile ?? [])) {
      if (d.severity <= 2) out.push({ line: d.line, kind: d.severity === 1 ? "error" : "warn" })
    }
    return out
  }, [text, comments, diagByFile, pinned])
  const jumpToRibbon = (line: number) => {
    const view = viewRef.current
    if (!view) return
    const n = Math.max(1, Math.min(line, view.state.doc.lines))
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.line(n).from, { y: "center" }),
    })
  }
  // Visible range as percentages, recomputed each render (renders fire on scroll).
  const scrollerEl = hostRef.current?.querySelector(".cm-scroller") as HTMLElement | null
  const ribbonBand =
    scrollerEl && scrollerEl.scrollHeight > scrollerEl.clientHeight + 4
      ? {
          top: (scrollerEl.scrollTop / scrollerEl.scrollHeight) * 100,
          height: (scrollerEl.clientHeight / scrollerEl.scrollHeight) * 100,
        }
      : null

  // Open the thread for the topmost comment on a clicked gutter line.
  const openThreadAtLine = (_line: number, ids: string[]) => {
    setComposer(null)
    setActiveThread(ids[0])
  }

  // Open the composer for a line range, capturing an adaptive context snapshot.
  // `prefill` seeds the body/type (e.g. a "Create task" from an LSP diagnostic).
  const openComposerFor = (
    startLine: number,
    endLine: number,
    prefill?: { body?: string; type?: CommentType },
  ) => {
    const view = viewRef.current
    if (!view) return
    const doc = view.state.doc
    const ctxStart = Math.max(1, startLine - 3)
    const ctxEnd = Math.min(doc.lines, endLine + 3)
    const slice = (a: number, b: number) => doc.sliceString(doc.line(a).from, doc.line(b).to)
    const context: Context = {
      snippet: slice(startLine, endLine),
      before: ctxStart < startLine ? slice(ctxStart, startLine - 1) : "",
      after: ctxEnd > endLine ? slice(endLine + 1, ctxEnd) : "",
    }
    setActiveThread(null)
    setComposer({
      startLine,
      endLine,
      context,
      initialBody: prefill?.body,
      initialType: prefill?.type,
    })
  }

  // Save the buffer to disk (Cmd/Ctrl+S). Never in PR mode: the bytes are the
  // PR's (from a ref), so writing them would clobber the user's working tree.
  const saveFile = async () => {
    const view = viewRef.current
    if (!view || pinned) return
    // A scratch buffer has nowhere to be written back to: saving one is Save As.
    if (isUntitled(path)) return saveAs()
    // Opt-in save pipeline, applied only on write (never on read): format on
    // save, then trim trailing whitespace and/or ensure a final newline. A
    // formatter that fails or hangs is reported but never blocks the write.
    const text = await textToSave(view)
    if (viewRef.current !== view) return // the tab changed while formatting ran
    noteSelfWrite(relPath) // our own save — don't let it mark the file unread
    writeFile(fileRoot, relPath, text)
      .then(() => {
        useEditorActions.getState().setDirty(relPath, false)
        setSaveError(false) // clear any prior failure on a successful save
        fileSaved(view) // the formatter may have rewritten it; re-ask the server
      })
      .catch((e) => {
        // The inline banner is the contextual surface; also log the raw error so
        // a save failure is never fully swallowed for diagnostics.
        log.error("file save failed", { path: relPath, error: safeError(e) })
        setSaveError(true)
      })
  }

  // Closing (or switching away from) a file with unsaved edits: write what is in
  // the buffer, right now. `saveFile` cannot be reused — it drops the write when
  // the tab changed under it, which is exactly the case here — and formatting is
  // skipped on purpose: the formatter resolves "the active document", which by
  // this point is the file being switched *to*.
  const flushOnClose = (view: EditorView, root: string) => {
    // The scratch buffer's disk is the store. This is what makes switching to
    // another tab and back keep the text: the view unmounts, and its content
    // has to land somewhere before it goes.
    if (isUntitled(path)) {
      useUntitled.getState().setText(path, view.state.doc.toString())
      useEditorActions.getState().setDirty(relPath, false)
      return
    }
    noteSelfWrite(relPath)
    writeFile(
      root,
      relPath,
      applyEol(applyHygiene(view.state.doc.toString(), relPath), eolFor(view)),
      encodingFor(view),
    )
      .then(() => useEditorActions.getState().setDirty(relPath, false))
      .catch((e) => log.error("flush on close failed", { path: relPath, error: safeError(e) }))
  }

  // Auto Save: write only when there are unsaved edits (avoids needless writes).
  const autoSave = () => {
    if (!useEditorActions.getState().isDirty(relPath)) return
    // Auto Save must not open a Save As dialog behind the user's back — for a
    // scratch buffer it means "park the text", which is all there is to do.
    const view = viewRef.current
    if (isUntitled(path)) {
      if (view) useUntitled.getState().setText(path, view.state.doc.toString())
      return
    }
    void saveFile()
  }

  // In re-anchor mode the same gesture sets an orphan's new anchor instead of
  // opening the composer.
  const anchorOrCompose = (start: number, end: number) => {
    if (reanchoringId) applyReanchor(relPath, start, end)
    else openComposerFor(start, end)
  }

  /**
   * Ask the server what it can do here, and show it under the cursor.
   *
   * Anchored to the caret rather than the pointer: ⌘. is a keyboard gesture, and
   * a menu that opens wherever the mouse happens to be is a menu you have to go
   * looking for.
   */
  const openActionMenu = async () => {
    const view = viewRef.current
    if (!view) return
    const actions = await actionsAtCursor()
    if (actions === null) {
      notify("info", t("lsp.noServer"))
      return
    }
    if (actions.length === 0) {
      notify("info", t("lsp.noActions"))
      return
    }
    const coords = view.coordsAtPos(view.state.selection.main.head)
    setActionMenu({
      x: coords?.left ?? 0,
      y: coords?.bottom ?? 0,
      actions,
    })
  }

  // Dismiss the peek panel on Escape.
  useEffect(() => {
    if (!peek) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPeek(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [peek])

  // Peek the definition of the symbol at the cursor in an inline panel. Prefers
  // the language server when one is attached, falling back to the symbol index.
  const peekDefinition = (): boolean => {
    const view = viewRef.current
    if (!view) return false
    const pos = view.state.selection.main.head
    const word = view.state.wordAt(pos)
    if (!word) return false
    const name = view.state.doc.sliceString(word.from, word.to)
    const top = toLocalTop(view.coordsAtPos(word.from)?.bottom ?? 0) ?? 8
    const root = fileRoot
    // Render a peek panel for a resolved definition location.
    const showAt = async (path: string, line: number) => {
      const content = await readFile(root, path).catch(() => null)
      const text = content && content.kind === "text" ? content.text : ""
      const all = text.split("\n")
      const start = Math.max(0, line - 6)
      const lines = all.slice(start, Math.min(all.length, line + 6))
      setPeek({
        top,
        label: `${toRelative(root, path)}:${line}`,
        lines,
        defLineIndex: line - 1 - start,
        target: { path, line },
      })
    }
    const showNone = () => setPeek({ top, label: name, lines: [], defLineIndex: -1, target: null })
    // Index fallback: search the symbol index by name.
    const fromIndex = () =>
      findDefinition(root, name)
        .then((defs) => (defs.length ? showAt(defs[0].path, defs[0].line) : showNone()))
        .catch(() => {})
    const fromServer = lspDefinition(view, pos)
    if (fromServer) {
      void fromServer.then((loc) => (loc ? showAt(loc.path, loc.line) : fromIndex()))
    } else {
      void fromIndex()
    }
    return true
  }

  // Confirm re-anchoring to the current selection (or the cursor's line) — the
  // explicit button so it doesn't depend on knowing the keyboard gesture.
  const confirmReanchor = () => {
    const view = viewRef.current
    if (!view) return
    const sel = view.state.selection.main
    const doc = view.state.doc
    applyReanchor(relPath, doc.lineAt(sel.from).number, doc.lineAt(sel.to).number)
  }

  // Start the gesture from the current selection (or the cursor's line).
  const startComposer = (view: EditorView): boolean => {
    const sel = view.state.selection.main
    const doc = view.state.doc
    anchorOrCompose(doc.lineAt(sel.from).number, doc.lineAt(sel.to).number)
    return true
  }

  // From the hovered "+" affordance: act on the whole current selection when
  // there is one, otherwise on the hovered line alone.
  const composeFromHover = (line: number) => {
    const view = viewRef.current
    if (!view) return
    const sel = view.state.selection.main
    if (!sel.empty) {
      const doc = view.state.doc
      anchorOrCompose(doc.lineAt(sel.from).number, doc.lineAt(sel.to).number)
    } else {
      anchorOrCompose(line, line)
    }
  }

  // Respond to a compose request from the global shortcut / command palette.
  useEffect(() => {
    if (composeNonce === lastComposeNonce.current) return
    lastComposeNonce.current = composeNonce
    if (viewRef.current) startComposer(viewRef.current)
    // startComposer reads live editor state on call; no need to re-bind.
  }, [composeNonce])

  // Explain / Peek requested from the palette or menu (primary pane only).
  useEffect(() => {
    if (explainNonce === lastExplainNonce.current) return
    lastExplainNonce.current = explainNonce
    if (primary) explainSelection(false)
  }, [explainNonce])
  useEffect(() => {
    if (peekNonce === lastPeekNonce.current) return
    lastPeekNonce.current = peekNonce
    if (primary) peekDefinition()
  }, [peekNonce])
  useEffect(() => {
    if (quickFixNonce === lastQuickFixNonce.current) return
    lastQuickFixNonce.current = quickFixNonce
    if (primary) void openActionMenu()
  }, [quickFixNonce])

  // Create the editor once per file.
  useEffect(() => {
    if (!hostRef.current) return
    // The project this buffer belongs to, captured now: by the time the cleanup
    // runs the store may already point at another project, and the flush must
    // not write this file's bytes into that one.
    const rootAtOpen = fileRoot
    const config = {
      doc: text,
      extensions: buildCodeExtensions({
        lineNumbersComp,
        activeLineComp,
        bracketComp,
        rulerComp,
        indentGuidesComp,
        gutterComp,
        changedComp,
        bookmarkComp,
        testComp,
        blameComp,
        diffComp,
        lspComp,
        completionComp,
        tabSizeComp,
        indentUnitComp,
        wrapComp,
        colorComp,
        colorSwatchesExt: colorSwatchesOn ? colorSwatches(onPickColor) : [],
        bracketColorComp,
        bracketColorsOn,
        whitespaceComp,
        focusComp,
        langComp,
        lineNumbersMode,
        activeLineMode,
        bracketMatchingOn,
        rulerColumn: effectiveRuler,
        indentGuidesMode,
        wrap,
        wrapColumn,
        suggestOnTyping,
        renderWhitespace,
        focusMode,
        primary,
        pinned,
        path,
        relPath,
        lineComments,
        changedLines,
        bookmarkLines,
        testLines,
        autoSaveTimer,
        cursorSaveTimer,
        openThreadAtLine,
        toggleBookmarkLine,
        runTestAtLine,
        startComposer,
        saveFile,
        peekDefinition,
        explainSymbol,
        showLensLocations: (x, y, locations) => setLensMenu({ x, y, locations }),
        openComposerFor,
        autoSave,
      }),
    }
    // The editor is rebuilt from scratch on every tab switch (`key` in Editor),
    // which would throw the undo history away with it. Restore the parked
    // history when the file comes back unchanged.
    const parked = parkedHistory.get(path)
    const state =
      parked && parked.doc === text
        ? EditorState.fromJSON(parked, config, { history: historyField })
        : EditorState.create(config)
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    if (primary) useDocInfo.getState().set({ view })

    // Restore the saved scroll offset for this file, after first layout.
    const savedScroll = useSessions.getState().byRoot[fileRoot]?.scroll?.[relPath]
    if (savedScroll) {
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.scrollDOM.scrollTop = savedScroll
      })
    }

    // Restore the saved cursor position, unless the file was opened with an
    // explicit landing/goToLine target (that jump wins). Clamp to the current
    // doc so a stale cursor can never throw or land out of bounds.
    const savedCursor = useSessions.getState().byRoot[fileRoot]?.cursor?.[relPath]
    if (savedCursor && !landingLine) {
      try {
        const doc = view.state.doc
        const lineNo = Math.min(Math.max(savedCursor.line, 1), doc.lines)
        const line = doc.line(lineNo)
        const pos = Math.min(line.from + Math.max(savedCursor.col - 1, 0), line.to)
        view.dispatch({ selection: { anchor: pos } })
      } catch {
        // Ignore a stale/invalid cursor — restore is best-effort.
      }
    }

    // Detect and lazily load the language pack for this filename.
    const desc = LanguageDescription.matchFilename(languages, path)
    if (desc) {
      desc.load().then((support) => {
        view.dispatch({ effects: langComp.reconfigure(support) })
      })
    } else {
      // No pack for this language. A contributed TextMate grammar can still
      // colour it — the file opens as plain text and gains highlighting once
      // the grammar is compiled, which is the honest order of events.
      // The enabled set, like every other consumer: a disabled extension must
      // not get to name the language of a file for one code path and not another.
      const installed = enabledExtensions(useMarketplace.getState().installed)
      void grammarSupport(resolvedLanguageId(installed, relPath)).then((support) => {
        if (support && viewRef.current === view) {
          view.dispatch({ effects: langComp.reconfigure(support) })
        }
      })
    }

    const unregister = registerView(view, relPath, rootAtOpen, primary, detectEol(text), encoding)

    return () => {
      // A pending debounced auto-save would fire into a destroyed view and drop
      // the edits on the floor: write them now instead.
      clearTimeout(autoSaveTimer.current)
      // The caret save is the opposite case — there is nothing to rescue, and
      // letting it fire is the bug: it reads the project root at *that* moment,
      // so closing a file and switching project inside the debounce filed this
      // file's caret under the new root.
      clearTimeout(cursorSaveTimer.current)
      if (!pinned && useEditorActions.getState().isDirty(relPath)) flushOnClose(view, rootAtOpen)
      unregister()
      parkHistory(path, view.state)
      view.destroy()
      viewRef.current = null
      if (useDocInfo.getState().view === view) useDocInfo.getState().set({ view: null })
    }
    // `text`/`path` identity drives recreation via the `key` prop in Editor.
  }, [])

  // Replace the document when the file changed on disk (e.g. an agent edited
  // it). Skipped while the user has unsaved manual edits so we never clobber
  // them; tagged as an external reload so it doesn't mark the doc dirty.
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === text) return
    if (useEditorActions.getState().isDirty(relPath)) return
    const sel = view.state.selection.main
    const len = text.length
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: Math.min(sel.anchor, len), head: Math.min(sel.head, len) },
      annotations: ExternalReload.of(true),
    })
  }, [text])

  // Turning suggestions on reaches the file you are looking at, not just the
  // next one you open.
  useReconfigure(viewRef, completionComp, autocompletion({ activateOnTyping: suggestOnTyping }), [
    suggestOnTyping,
    completionComp,
  ])

  // Reconfigure line wrapping live.
  useReconfigure(viewRef, wrapComp, wrapExt(wrap, wrapColumn), [wrap, wrapColumn, wrapComp])

  // A stable callback: the extension captures it once, so it must not be
  // rebuilt on every render or every swatch would remount.
  const onPickColor = useCallback((hit: SwatchHit) => setPickingColor(hit), [])
  useReconfigure(viewRef, colorComp, colorSwatchesOn ? colorSwatches(onPickColor) : [], [
    colorSwatchesOn,
    colorComp,
    onPickColor,
  ])

  // Reading controls: reconfigure their compartments live (no editor remount).
  useReconfigure(viewRef, lineNumbersComp, lineNumbersExt(lineNumbersMode), [
    lineNumbersMode,
    lineNumbersComp,
  ])
  useReconfigure(viewRef, activeLineComp, activeLineExt(activeLineMode), [
    activeLineMode,
    activeLineComp,
  ])
  useReconfigure(viewRef, indentGuidesComp, indentGuidesExt(indentGuidesMode), [
    indentGuidesMode,
    indentGuidesComp,
  ])
  useReconfigure(viewRef, bracketComp, bracketMatchingOn ? bracketMatching() : [], [
    bracketMatchingOn,
    bracketComp,
  ])
  // `max_line_length` is the project's own answer about its line width, so it
  // outranks the reader's ruler setting. `0` is editorconfig's explicit "off".
  const effectiveRuler = editorConfig?.maxLineLength ?? rulerColumn
  useReconfigure(viewRef, rulerComp, rulerExt(effectiveRuler), [effectiveRuler, rulerComp])
  useReconfigure(viewRef, bracketColorComp, bracketColorsOn ? bracketColors : [], [
    bracketColorsOn,
    bracketColorComp,
  ])

  // Update the PR change markers when they arrive (async) or the file changes.
  useReconfigure(viewRef, changedComp, changedLinesHighlight(changedLines), [
    changedLines,
    changedComp,
  ])

  // Toggle whitespace rendering live.
  useReconfigure(viewRef, whitespaceComp, renderWhitespace ? highlightWhitespace() : [], [
    renderWhitespace,
    whitespaceComp,
  ])

  // Connect the language server for this file (primary pane only, to avoid two
  // editors syncing the same document). Falls back to nothing when no server is
  // installed for the language.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // No language server for a PR-pinned file: its bytes are the PR's, but the
    // workspace on disk is the reviewer's branch, so the LSP would flag the PR's
    // own additions (new params, new symbols) as errors. Diagnostics here are
    // noise, not signal.
    if (!primary || pinned || !hasServer(path)) {
      view.dispatch({ effects: lspComp.reconfigure([]) })
      return
    }
    let cancelled = false
    lspSupport(fileRoot, path).then((ext) => {
      if (!cancelled) viewRef.current?.dispatch({ effects: lspComp.reconfigure(ext ?? []) })
    })
    return () => {
      cancelled = true
    }
    // `serversNonce`: a server installed while this file is open attaches to it,
    // instead of waiting for the window to be rebuilt.
  }, [path, primary, pinned, lspComp, serversNonce])

  // Apply the (possibly status-bar-overridden) tab display width, and the unit
  // that auto-indent and Tab actually insert.
  useReconfigure(viewRef, tabSizeComp, EditorState.tabSize.of(indentSize), [
    indentSize,
    tabSizeComp,
  ])
  const unit = indentKind === "tabs" ? "\t" : " ".repeat(indentSize)
  useReconfigure(viewRef, indentUnitComp, indentUnit.of(unit), [unit, indentUnitComp])

  // Apply a manual language-mode override picked from the status bar.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !languageOverride) return
    const desc = languages.find((l) => l.name === languageOverride)
    if (!desc) {
      view.dispatch({ effects: langComp.reconfigure([]) }) // Plain Text
      return
    }
    desc.load().then((support) => {
      viewRef.current?.dispatch({ effects: langComp.reconfigure(support) })
    })
  }, [languageOverride, langComp])

  // Surface document info (line endings, indentation, language) to the status
  // bar. Detected from the raw text, since CodeMirror normalises line endings.
  // Only the primary pane drives the status bar.
  useEffect(() => {
    if (!primary) return
    const desc = LanguageDescription.matchFilename(languages, path)
    const ext = path.split(".").pop() ?? ""
    const language = desc?.name ?? (ext ? ext.toUpperCase() : "Plain Text")
    const indent = detectIndent(text)
    useDocInfo.getState().set({
      eol: detectEol(text),
      encoding: encoding ?? "utf-8",
      indentKind: indent.kind,
      indentSize: indent.size,
      language,
      languageOverride: null,
    })
  }, [text, path, primary, encoding])

  // `.editorconfig` outranks what the file looks like.
  //
  // Detection is a guess made from the bytes; the project's own file is the
  // answer, and honouring it is why committing one is worth anything. Applied
  // after the detection effect above (both run on open, in order), and recorded
  // per file so the save paths can obey the trim / final-newline rules too.
  useEffect(() => {
    let cancelled = false
    editorConfigFor(fileRoot, path)
      .then((cfg) => {
        if (cancelled) return
        setEditorConfig(cfg.applies ? cfg : null)
        recordEditorConfig(relPath, cfg)
        if (!cfg.applies || !primary) return
        const patch: { indentKind?: "spaces" | "tabs"; indentSize?: number; eol?: Eol } = {}
        if (cfg.indentStyle) patch.indentKind = cfg.indentStyle === "tab" ? "tabs" : "spaces"
        if (cfg.indentSize) patch.indentSize = cfg.indentSize
        // `cr`-only endings are a real editorconfig value and not something
        // Reado writes, so it is read as LF rather than silently mangled.
        if (cfg.endOfLine === "lf" || cfg.endOfLine === "crlf") {
          patch.eol = cfg.endOfLine.toUpperCase() as Eol
        }
        if (Object.keys(patch).length > 0) useDocInfo.getState().set(patch)
      })
      .catch(() => {
        if (!cancelled) setEditorConfig(null)
      })
    return () => {
      cancelled = true
    }
  }, [path, relPath, primary])

  // Toggle focus mode live.
  useReconfigure(viewRef, focusComp, focusExtension(focusMode), [focusMode, focusComp])

  // Rebuild the comment gutter when this file's comments change.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterComp.reconfigure(commentGutter(lineComments, openThreadAtLine)),
    })
    // openThreadAtLine is stable enough (only setters); rebuild on data change.
  }, [lineComments, gutterComp])

  // Rebuild the bookmark gutter when this file's bookmarks change.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: bookmarkComp.reconfigure(bookmarkGutter(bookmarkLines, toggleBookmarkLine)),
    })
  }, [bookmarkLines, toggleBookmarkLine, bookmarkComp])

  // And the test gutter, as a run finishes and verdicts land. Compared by value
  // first: a run repaints the store once per verdict, and a file with no tests
  // would otherwise reconfigure CodeMirror on every one of them for an empty
  // gutter.
  const drawnTests = useRef("")
  useEffect(() => {
    const shape = [...testLines].map(([line, status]) => `${line}:${status ?? ""}`).join(",")
    if (shape === drawnTests.current) return
    drawnTests.current = shape
    viewRef.current?.dispatch({
      effects: testComp.reconfigure(testGutter(testLines, runTestAtLine)),
    })
  }, [testLines, runTestAtLine, testComp])

  // The blame column (breadcrumb toggle) and the inline, cursor-line annotation
  // (a setting) read the same `git_blame`, so one fetch serves both. The column
  // wins when both are on — showing the same fact twice on one line is noise.
  useEffect(() => {
    if (!blame && !inlineBlameOn) {
      viewRef.current?.dispatch({ effects: blameComp.reconfigure([]) })
      return
    }
    let cancelled = false
    gitBlame(fileRoot, relPath)
      .then((lines) => {
        if (cancelled || !lines.length) return
        const ext = blame ? blameGutter(lines) : inlineBlame(lines)
        viewRef.current?.dispatch({ effects: blameComp.reconfigure(ext) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [blame, inlineBlameOn, relPath, blameComp])

  // Mark the lines this working tree changes since HEAD. Keyed on `text`, which
  // is what a save or an on-disk change produces (the file is re-read and the
  // prop replaced) — this component is keyed by path, so it does not remount on
  // a save and nothing else here would refresh the marks.
  useEffect(() => {
    if (!diffGutterOn) {
      viewRef.current?.dispatch({ effects: diffComp.reconfigure([]) })
      return
    }
    let cancelled = false
    gitWorkingDiffLines(fileRoot, relPath)
      .then((ranges) => {
        if (!cancelled) {
          viewRef.current?.dispatch({ effects: diffComp.reconfigure(diffGutter(ranges)) })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [diffGutterOn, relPath, diffComp, text])

  // Highlight the anchored block while its thread is open.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const c = activeId ? comments.find((x) => x.id === activeId) : null
    const block =
      c && c.anchor.scope === "range" ? { from: c.anchor.startLine, to: c.anchor.endLine } : null
    view.dispatch({ effects: setBlock.of(block) })
  }, [activeId, comments])

  // A thread hangs from its line, so one opened near the bottom of the editor ran
  // past it — under the panel below, most of the box out of sight. Scroll the
  // code up by what's missing instead: the box stays attached to its line (the
  // connector depends on it), and the room past the last line
  // (`--code-scroll-past-end`) is there for exactly this. Waits a frame, for the
  // box to have laid out its height.
  useEffect(() => {
    if (!activeId) return
    const frame = requestAnimationFrame(() => {
      const wrap = wrapRef.current
      const box = wrap?.querySelector<HTMLElement>("[data-comment-thread]")
      const view = viewRef.current
      if (!wrap || !box || !view) return
      const overflow = box.offsetTop + box.offsetHeight + 8 - wrap.clientHeight
      if (overflow > 0) view.scrollDOM.scrollTop += overflow
    })
    return () => cancelAnimationFrame(frame)
  }, [activeId])

  // Re-position overlays as the editor scrolls or the window resizes, and
  // remember the scroll offset (debounced) so the session can restore it.
  useEffect(() => {
    const scroller = hostRef.current?.querySelector(".cm-scroller") as HTMLElement | null
    let timer: number | undefined
    let dwell: number | undefined
    // Auto-mark this file read, once per open (so a manual "unread" sticks for the
    // session): a scrollable file when scrolled to the bottom; a file that fully
    // fits the viewport — which fires no scroll — after a short dwell, so it isn't
    // left permanently unread just for being short.
    let autoMarked = false
    const markRead = () => {
      if (autoMarked) return
      autoMarked = true
      // Pass the text we already hold: without it `mark` re-reads the file from
      // disk over IPC, once per file opened, to snapshot what is on screen.
      useReadProgress.getState().mark(fileRoot, relPath, true, text)
    }
    const fits = () => !!scroller && scroller.scrollHeight <= scroller.clientHeight + 24
    const maybeMarkRead = () => {
      if (autoMarked || !scroller) return
      if (fits()) {
        // Fully visible — mark read after a brief dwell so a quick tab-through
        // doesn't count. Re-check `fits()` when it fires: a late layout that turns
        // out scrollable must fall back to the scroll-to-bottom path instead.
        if (dwell == null) dwell = window.setTimeout(() => fits() && markRead(), 1200)
        return
      }
      // Scrollable (or became so after layout) — cancel any pending fits-dwell and
      // mark read on reaching the bottom.
      if (dwell != null) {
        window.clearTimeout(dwell)
        dwell = undefined
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 24) markRead()
    }
    // Coalesce to one frame: scroll fires far faster than the screen repaints, and
    // each run re-renders this whole component and sets sticky state on top. The
    // trailing scroll-position save stays on its own debounce, outside the frame.
    let frame: number | undefined
    const bump = () => {
      if (frame === undefined) {
        frame = window.requestAnimationFrame(() => {
          frame = undefined
          setTick((n) => n + 1)
          computeSticky()
          maybeMarkRead()
        })
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        useSessions.getState().saveScroll(fileRoot, relPath, scroller?.scrollTop ?? 0)
      }, 300)
    }
    scroller?.addEventListener("scroll", bump, { passive: true })
    window.addEventListener("resize", bump)
    // A short file fires neither scroll nor resize — check once after the initial
    // layout has settled.
    const initial = window.setTimeout(maybeMarkRead, 0)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(dwell)
      window.clearTimeout(initial)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      scroller?.removeEventListener("scroll", bump)
      window.removeEventListener("resize", bump)
    }
  }, [])

  // Recompute (or clear) the sticky headers when the setting toggles.
  useEffect(() => {
    computeSticky()
    // computeSticky reads live refs/state; safe to omit from deps.
  }, [stickyScroll])

  // Scroll to, put the caret on, and softly highlight the landing line.
  //
  // The caret matters as much as the scroll: without it you land on the line
  // visually while the cursor is still wherever it was — line 1 of a file just
  // opened — so the first arrow key or keystroke throws you back to the top. It
  // also left the app disagreeing with itself, since clicking a symbol in the
  // outline and F12 both move the caret. Focus is deliberately not taken: the
  // panel you clicked from keeps it, exactly as before.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !landingLine) return
    const lineNo = Math.min(landingLine.line, view.state.doc.lines)
    const pos = view.state.doc.line(lineNo).from
    view.dispatch({
      selection: { anchor: pos },
      effects: [EditorView.scrollIntoView(pos, { y: "center" }), setLanding.of(lineNo)],
    })
    const timer = setTimeout(() => {
      viewRef.current?.dispatch({ effects: setLanding.of(null) })
    }, 1400)
    return () => clearTimeout(timer)
  }, [landingLine])

  // Convert a viewport y (from coordsAtPos / pointer events) into a top offset
  // within the overlay container, expressed in the container's LAYOUT pixels.
  //
  // getBoundingClientRect() reports *visual* pixels (scaled by the page zoom and
  // device-pixel ratio), but a CSS `top` is applied in *layout* pixels. Under
  // zoom the two differ, so the raw difference drifts further the lower the line
  // is. Dividing by the effective scale (visual height / layout height) makes the
  // overlay track its anchor at any zoom and window size.
  const toLocalTop = (viewportY: number): number | null => {
    const wrap = wrapRef.current
    if (!wrap) return null
    const rect = wrap.getBoundingClientRect()
    const scale = wrap.offsetHeight ? rect.height / wrap.offsetHeight : 1
    return (viewportY - rect.top) / scale
  }

  // Pixel offset of a line's top, relative to the overlay container. Returns
  // null when the line is scrolled out of view (overlay is then hidden).
  const topForLine = (line: number): number | null => {
    const view = viewRef.current
    if (!view) return null
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines)
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from)
    return coords ? toLocalTop(coords.top) : null
  }

  // Pixel offset of a line's *bottom* edge, relative to the overlay container.
  const bottomForLine = (line: number): number | null => {
    const view = viewRef.current
    if (!view) return null
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines)
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from)
    return coords ? toLocalTop(coords.bottom) : null
  }

  // Keep an overlay of the given height fully within the editor viewport, so a
  // popover anchored near the bottom edge opens upward instead of clipping.
  const clampTop = (top: number | null, panelHeight: number): number | null => {
    if (top === null) return null
    const wrapH = wrapRef.current?.clientHeight ?? 0
    return Math.max(8, Math.min(top, wrapH - panelHeight - 8))
  }

  const openComment = activeId ? (comments.find((c) => c.id === activeId) ?? null) : null
  const wrapH = wrapRef.current?.clientHeight ?? 0
  const composerTop = clampTop(composer ? topForLine(composer.endLine) : null, 260)
  // The thread box hangs from the *bottom* of the last commented line and scrolls
  // with the code. It is shown only while that line is within the viewport, so
  // the connector always points at its anchor and never runs across unrelated
  // lines — when the anchor scrolls off-screen, the panel scrolls off with it.
  const rawThreadTop = openComment ? bottomForLine(openComment.anchor.endLine) : null
  const threadTop =
    rawThreadTop !== null && rawThreadTop >= 0 && rawThreadTop <= wrapH ? rawThreadTop : null
  // Room to scroll past the last line while a thread is open, so a comment on
  // the final lines can be scrolled up until its box clears the bottom edge.
  // The box is capped at 70% of the viewport (CommentThread), so 75% always
  // clears it — and it costs nothing when no thread is open.
  const scrollPastEnd = openComment && wrapH > 0 ? `${Math.round(wrapH * 0.75)}px` : undefined

  const closeOverlays = () => {
    setComposer(null)
    setActiveThread(null)
  }

  // Recompute the sticky-scroll headers: walk up from the first visible line,
  // collecting scope openers ({ or :) of strictly decreasing indentation.
  const computeSticky = () => {
    const view = viewRef.current
    if (!view || !useSettings.getState().stickyScroll) {
      setSticky([])
      return
    }
    const doc = view.state.doc
    const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
    const topLine = doc.lineAt(topBlock.from).number
    const indentOf = (s: string) => s.match(/^[\t ]*/)?.[0].length ?? 0
    const isOpener = (s: string) => /[{:]$/.test(s.trim())

    const headers: { line: number; text: string }[] = []
    let limit = Infinity
    for (let n = topLine - 1; n >= 1 && headers.length < 5; n--) {
      const text = doc.line(n).text
      if (!text.trim()) continue
      const indent = indentOf(text)
      if (indent < limit && isOpener(text)) {
        headers.unshift({ line: n, text: text.replace(/\s+$/, "") })
        limit = indent
        if (indent === 0) break
      }
    }
    setSticky((prev) =>
      prev.length === headers.length && prev.every((h, i) => h.line === headers[i].line)
        ? prev
        : headers,
    )
  }

  // Open the editor context menu at the right-clicked position.
  const onContextMenu = (e: React.MouseEvent) => {
    const view = viewRef.current
    if (!view) return
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, pos })
  }

  // Build the context-menu actions for the clicked position.
  // Ask the focused agent to explain the current selection (or cursor line),
  // optionally recording the explanation as an anchored note.
  const explainSelection = (asNote: boolean) => {
    const view = viewRef.current
    if (!view) return
    const sel = view.state.selection.main
    const doc = view.state.doc
    const prompt = composeExplainPrompt(
      relPath,
      doc.lineAt(sel.from).number,
      doc.lineAt(sel.to).number,
      asNote,
    )
    void dispatchToAgent(prompt)
  }

  // Explain a single symbol using the language server's hover docs as context
  // (great for external libraries), and let the agent leave a note on the line.
  const explainSymbol = (pos: number) => {
    const view = viewRef.current
    if (!view) return
    const word = view.state.wordAt(pos)
    if (!word) return
    const symbol = view.state.doc.sliceString(word.from, word.to)
    const line = view.state.doc.lineAt(pos).number
    lspHover(view, pos).then((docs) => {
      const prompt = composeSymbolExplainPrompt(relPath, line, symbol, docs ?? "")
      void dispatchToAgent(prompt)
    })
  }

  const ctxActions = () => {
    const view = viewRef.current
    if (!view || !ctxMenu) return []
    const pos = ctxMenu.pos
    const word = view.state.wordAt(pos)
    const isRepo = useProject.getState().git.isRepo
    // A language-server diagnostic at the clicked line — offered as a quick
    // "create task" so the problem can become an anchored task without hovering.
    const clickLine = view.state.doc.lineAt(pos)
    let diagMessage: string | null = null
    forEachDiagnostic(view.state, (d, from, to) => {
      if (diagMessage) return
      if (to >= clickLine.from && from <= clickLine.to) diagMessage = d.message
    })
    const hasSelection = !view.state.selection.main.empty
    // With no selection, cut and copy take the whole line — the way they do in
    // VS Code, and the reason the pair is worth reaching for without selecting
    // anything first. `to` spans the line break so a cut removes the line rather
    // than leaving a blank one behind.
    const clipRange = () => {
      const sel = view.state.selection.main
      if (!sel.empty)
        return { from: sel.from, to: sel.to, text: view.state.sliceDoc(sel.from, sel.to) }
      const line = view.state.doc.lineAt(sel.head)
      return {
        from: line.from,
        to: Math.min(line.to + 1, view.state.doc.length),
        text: `${line.text}\n`,
      }
    }
    return [
      // The webview has no native context menu, so the clipboard verbs have to
      // be here or right-click offers no way to copy at all.
      !pinned && {
        label: t("editor.cut"),
        run: () => {
          const { from, to, text } = clipRange()
          void clipboardWriteText(text).catch(() => {})
          view.dispatch({ changes: { from, to, insert: "" } })
        },
      },
      {
        label: t("editor.copy"),
        run: () => void clipboardWriteText(clipRange().text).catch(() => {}),
      },
      !pinned && {
        label: t("editor.paste"),
        run: () => {
          void clipboardReadText()
            .then((text) => text && view.dispatch(view.state.replaceSelection(text)))
            .catch(() => {})
        },
      },
      word && {
        label: t("editor.goToDef"),
        separatorBefore: true,
        run: () => goToDefinitionAt(view, pos),
      },
      hasServer(path) &&
        word && {
          label: t("editor.goToTypeDef"),
          run: () => goToTypeDefinitionAt(view, pos),
        },
      hasServer(path) &&
        word && {
          label: t("editor.goToImpl"),
          run: () => goToImplementationAt(view, pos),
        },
      hasServer(path) &&
        word && {
          label: t("editor.explainSymbol"),
          run: () => explainSymbol(pos),
        },
      word && {
        label: t("editor.peekDef"),
        run: () => {
          view.dispatch({ selection: { anchor: pos } })
          peekDefinition()
        },
      },
      word && {
        label: t("editor.findRefs"),
        run: () => {
          view.dispatch({ selection: { anchor: pos } })
          findReferencesAt(view)
        },
      },
      !pinned &&
        hasServer(path) &&
        word && {
          label: t("editor.renameSymbol"),
          run: () => {
            view.dispatch({ selection: { anchor: pos } })
            view.focus()
            renameSymbolAt(view)
          },
        },
      hasSelection && {
        label: t("editor.allOccurrences"),
        run: () => selectSelectionMatches(view),
      },
      hasServer(path) && {
        label: t("lsp.quickFix"),
        separatorBefore: true,
        run: () => void openActionMenu(),
      },
      hasServer(path) && {
        label: t("lsp.organizeImports"),
        run: () => void organizeImports(),
      },
      diagMessage && {
        label: t("lsp.createTaskFromProblem"),
        run: () =>
          openComposerFor(clickLine.number, clickLine.number, { body: diagMessage!, type: "bug" }),
      },
      {
        label: t("comment.new"),
        run: () => {
          const line = view.state.doc.lineAt(pos).number
          openComposerFor(line, line)
        },
      },
      { label: t("editor.explain"), run: () => explainSelection(false) },
      { label: t("editor.explainNote"), run: () => explainSelection(true) },
      // A pinned (PR-ref) buffer is read-only — formatting mutates it but the
      // save is a no-op, so don't offer it.
      !pinned && { label: t("editor.format"), run: () => void formatDocument() },
      // Only when there is something unsaved to compare — otherwise the diff is
      // guaranteed empty and the item is a dead end.
      !pinned &&
        useEditorActions.getState().isDirty(relPath) && {
          label: t("diff.compareWithSaved"),
          run: () => compareWithSaved(),
        },
      isRepo && {
        label: t("diff.toggle"),
        run: () => useEditorActions.getState().setDiffing(!useEditorActions.getState().diffing),
      },
    ].filter(Boolean) as { label: string; run: () => void; separatorBefore?: boolean }[]
  }

  // Track the hovered line to show the "+" add-comment affordance.
  const onMouseMove = (e: React.MouseEvent) => {
    const view = viewRef.current
    if (!view || !wrapRef.current) return
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos == null) return
    const line = view.state.doc.lineAt(pos).number
    const coords = view.coordsAtPos(view.state.doc.line(line).from)
    if (!coords) return
    const top = toLocalTop(coords.top)
    if (top === null) return
    setHover((prev) => (prev?.line === line ? prev : { line, top }))
  }

  const showAddButton = hover && !composer && !openComment

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto h-full w-full"
      data-code-wrap=""
      data-cursor-style={cursorStyle}
      data-cursor-blink={cursorBlink}
      data-scrollbar={scrollbar}
      data-inline-diagnostics={inlineDiagnostics ? "on" : "off"}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      onContextMenu={onContextMenu}
      style={
        {
          "--code-font": codeFont || undefined,
          "--code-font-size": `${fontSize}px`,
          "--code-line-height": String(lineHeight),
          "--code-letter-spacing": `${letterSpacing}em`,
          "--code-scroll-past-end": scrollPastEnd,
        } as React.CSSProperties
      }
    >
      <div ref={hostRef} className="h-full w-full [&_.cm-editor]:h-full" />

      {saveError && <SaveErrorBanner onDismiss={() => setSaveError(false)} />}

      {showRibbon && (
        <StructureRibbon
          marks={ribbonMarks}
          totalLines={totalLines}
          band={ribbonBand}
          onJump={jumpToRibbon}
        />
      )}

      {sticky.length > 0 && <StickyHeaders headers={sticky} viewRef={viewRef} hostRef={hostRef} />}

      {pickingColor && (
        <ColorPickerPopover
          hit={pickingColor}
          onChange={(literal) => {
            const view = viewRef.current
            if (!view) return
            // Rewrite in place and keep the picker anchored to the new literal:
            // dragging in the picker is a stream of edits, not one.
            view.dispatch({
              changes: { from: pickingColor.from, to: pickingColor.to, insert: literal },
            })
            setPickingColor({ ...pickingColor, to: pickingColor.from + literal.length })
          }}
          onClose={() => setPickingColor(null)}
        />
      )}

      {reanchoringId && (
        <ReanchorBar label={reanchorLabel} onConfirm={confirmReanchor} onCancel={cancelReanchor} />
      )}

      {/* Peek definition: an inline preview anchored under the symbol. */}
      {peek && (
        <PeekPanel
          peek={peek}
          onOpen={(target) => {
            useProject.getState().open(target.path, target.line)
            setPeek(null)
          }}
          onClose={() => setPeek(null)}
        />
      )}

      {showAddButton && (
        <AddCommentButton top={hover.top} onClick={() => composeFromHover(hover.line)} />
      )}

      {composer && composerTop !== null && (
        <CommentComposer
          relPath={relPath}
          startLine={composer.startLine}
          endLine={composer.endLine}
          context={composer.context}
          initialBody={composer.initialBody}
          initialType={composer.initialType}
          top={composerTop}
          onClose={closeOverlays}
        />
      )}

      {/* A bracket that wraps the commented lines and flows into the thread box
          as a single shape: a vertical rail in the line-number gutter spanning
          every commented line, a horizontal run below the last line, and a
          rounded (never square) turn into the box's top-left corner. Drawn in
          the box's own colour/outline so line and box read as one object. */}
      {openComment && threadTop !== null && (
        // Start may sit above the viewport on a multi-line anchor; clamp the
        // rail to the top edge so the connector still draws.
        <ThreadConnector
          comment={openComment}
          threadTop={threadTop}
          startTop={topForLine(openComment.anchor.startLine) ?? 0}
          width={wrapRef.current?.clientWidth ?? 0}
        />
      )}

      {openComment && threadTop !== null && (
        <CommentThread comment={openComment} top={threadTop} onClose={closeOverlays} />
      )}

      {actionMenu && (
        <ContextMenu
          x={actionMenu.x}
          y={actionMenu.y}
          items={actionMenu.actions.map((action, i) => ({
            // The group heading rides on the first item of each run, so the
            // shared menu doesn't need a heading concept it has no other use for.
            label:
              i === 0 || groupOf(action.kind) !== groupOf(actionMenu.actions[i - 1].kind)
                ? `${t(GROUP_LABEL[groupOf(action.kind)] as MessageKey)} · ${action.title}`
                : action.title,
            separatorBefore:
              i > 0 && groupOf(action.kind) !== groupOf(actionMenu.actions[i - 1].kind),
            onSelect: () => void runAction(action),
          }))}
          onClose={() => setActionMenu(null)}
        />
      )}

      {lensMenu && (
        <ContextMenu
          x={lensMenu.x}
          y={lensMenu.y}
          items={lensMenu.locations.map((loc) => ({
            label: `${toRelative(fileRoot, loc.path)}:${loc.line}`,
            onSelect: () => useProject.getState().open(loc.path, loc.line),
          }))}
          onClose={() => setLensMenu(null)}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxActions().map((a) => ({
            label: a.label,
            onSelect: a.run,
            separatorBefore: a.separatorBefore,
          }))}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
