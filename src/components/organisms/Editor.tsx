/**
 * The reading surface.
 *
 * Renders the active file with a type-appropriate viewer:
 *   - code / text → CodeMirror 6 (read-only by default; read-first is the point)
 *   - markdown     → formatted via react-markdown
 *   - image        → inline preview
 *   - binary       → honest "no preview" placeholder
 *
 * CodeMirror virtualizes rendering, so multi-thousand-line files stay smooth.
 * Syntax highlighting and the editor theme come from `lib/codemirror.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState, Compartment, StateEffect, StateField, Annotation, Facet } from "@codemirror/state";
import { listen } from "@tauri-apps/api/event";
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  highlightWhitespace,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import {
  foldGutter,
  bracketMatching,
  foldKeymap,
  LanguageDescription,
} from "@codemirror/language";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { languages } from "../../lib/languages";
import { occurrenceHighlight } from "../../lib/occurrenceHighlight";
import { syntaxSelection, expandSelection, shrinkSelection } from "../../lib/syntaxSelection";
import { keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, gotoLine, highlightSelectionMatches } from "@codemirror/search";
import { forEachDiagnostic } from "@codemirror/lint";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  readFile,
  reanchorFile,
  writeFile,
  gitBlame,
  findDefinition,
  resolveImport,
  type Comment,
  type CommentType,
  type Context,
  type FileContent,
} from "../../lib/api";
import { readoAppearance } from "../../lib/codemirror";
import { diagnosticsRuler } from "../../lib/overviewRuler";
import { commentGutter, type LineComments } from "../../lib/commentGutter";
import { blameGutter } from "../../lib/blameGutter";
import { bookmarkGutter } from "../../lib/bookmarkGutter";
import { useBookmarks } from "../../lib/bookmarks";
import { useDiagnostics } from "../../lib/diagnostics";
import { extractSymbols } from "../../lib/outline";
import { StructureRibbon, type RibbonMark } from "./StructureRibbon";
import { useDocInfo, detectEol, detectIndent, formatDocument, setLastEdit } from "../../lib/docInfo";
import { useComments, commentsForFile, toRelative } from "../../lib/comments";
import { useTextView } from "../../lib/textView";
import { useReadProgress, noteSelfWrite } from "../../lib/readProgress";
import { dispatchToAgent } from "../../lib/agents";
import { composeExplainPrompt, composeSymbolExplainPrompt } from "../../lib/review";
import { lspSupport, hasServer, lspLocate, lspDefinition, lspHover } from "../../lib/lsp";
import { taskFromDiagnostic, explainSymbolAt } from "../../lib/lspActions";
import {
  useCursor,
  useEditorActions,
  useProject,
  useSessions,
  useSettings,
  useWorkspace,
} from "../../lib/store";

import { CommentComposer } from "../organisms/CommentComposer";
import { CommentThread } from "../organisms/CommentThread";
import { ACCENT } from "../atoms/commentMeta";
import { Welcome } from "../molecules/Welcome";
import { DiffView } from "../organisms/DiffView";
import { ImageView } from "../organisms/ImageView";
import { ContextMenu } from "../atoms/ContextMenu";
import { PlusIcon, DocsIcon, EditIcon, CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

/** Shared layout for the non-code placeholder states (empty / loading / binary). */
const PLACEHOLDER = "grid h-full place-items-center p-8 text-center text-muted";

/** Marks a doc change as a reload from disk (an external edit), not a user edit,
 * so it doesn't flip the dirty flag. */
const ExternalReload = Annotation.define<boolean>();

/** StateEffect/Field driving the transient landing-line highlight. */
const setLanding = StateEffect.define<number | null>();
const landingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLanding)) {
        if (e.value == null) return Decoration.none;
        const line = tr.state.doc.line(Math.min(e.value, tr.state.doc.lines));
        value = Decoration.set([
          Decoration.line({ class: "cm-landing-line" }).range(line.from),
        ]);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** StateEffect/Field highlighting the anchored block while its thread is open. */
const setBlock = StateEffect.define<{ from: number; to: number } | null>();
const blockField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setBlock)) {
        if (!e.value) return Decoration.none;
        const ranges = [];
        const max = tr.state.doc.lines;
        for (let l = Math.max(1, e.value.from); l <= Math.min(e.value.to, max); l++) {
          ranges.push(
            Decoration.line({ class: "cm-comment-block" }).range(tr.state.doc.line(l).from),
          );
        }
        return Decoration.set(ranges);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Underline of the symbol under the cursor while a modifier is held, to signal
 *  it is click-to-navigate (VS Code style). */
const setLink = StateEffect.define<{ from: number; to: number } | null>();
const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLink)) {
        value = e.value
          ? Decoration.set([
              Decoration.mark({ class: "cm-goto-link" }).range(e.value.from, e.value.to),
            ])
          : Decoration.none;
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The open file's absolute path for a view, so module-level handlers resolve
 *  imports against the right file even in a split pane. */
const filePathFacet = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });

/** The contents of a quoted string literal containing `pos` on its line, if
 *  any (handles ', " and ` with escapes). Used to detect import paths. */
function stringLiteralAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from;
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const start = m.index + 1;
    const end = start + m[2].length;
    if (col >= start && col <= end) return m[2];
  }
  return null;
}

/** Resolve the thing at `pos` to its definition and jump there. A relative
 *  import path opens the file it points at; otherwise the identifier is resolved
 *  via the symbol index. */
function goToDefinitionAt(view: EditorView, pos: number) {
  const str = stringLiteralAt(view, pos);
  if (str && (str.startsWith("./") || str.startsWith("../"))) {
    const fromFile = view.state.facet(filePathFacet) || useProject.getState().active;
    if (fromFile) {
      resolveImport(useProject.getState().root, fromFile, str)
        .then((p) => p && useProject.getState().open(p))
        .catch(() => {});
      return;
    }
  }
  // Prefer the language server when one is attached; it returns true so we only
  // fall back to the symbol index for files with no server.
  if (lspLocate(view, pos, "definition", (p, l) => useProject.getState().open(p, l))) return;
  const word = view.state.wordAt(pos);
  if (!word) return;
  const name = view.state.doc.sliceString(word.from, word.to);
  findDefinition(useProject.getState().root, name)
    .then((defs) => {
      if (defs.length) useProject.getState().open(defs[0].path, defs[0].line);
    })
    .catch(() => {});
}

/** Go to the type definition / implementation of the symbol at `pos` via the
 *  language server (no index equivalent; a no-op when no server is attached). */
function goToTypeDefinitionAt(view: EditorView, pos: number) {
  lspLocate(view, pos, "typeDefinition", (p, l) => useProject.getState().open(p, l));
}
function goToImplementationAt(view: EditorView, pos: number) {
  lspLocate(view, pos, "implementation", (p, l) => useProject.getState().open(p, l));
}

/** Find references: project-wide search for the identifier at the cursor. */
function findReferencesAt(view: EditorView): boolean {
  const word = view.state.wordAt(view.state.selection.main.head);
  if (!word) return false;
  const name = view.state.doc.sliceString(word.from, word.to);
  if (name) useWorkspace.getState().searchFor(name);
  return true;
}

/** Editor DOM handlers for go-to-definition: modifier+click navigates, and
 *  modifier+hover underlines the symbol it would resolve. */
const gotoDefinitionHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    goToDefinitionAt(view, pos);
    event.preventDefault();
    return true;
  },
  mousemove(event, view) {
    const held = event.metaKey || event.ctrlKey;
    const current = view.state.field(linkField, false);
    if (!held) {
      if (current && current.size) view.dispatch({ effects: setLink.of(null) });
      return false;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const word = pos != null ? view.state.wordAt(pos) : null;
    view.dispatch({ effects: setLink.of(word ? { from: word.from, to: word.to } : null) });
    return false;
  },
});

const human = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path);

/**
 * Focus mode dims every line except the one under the cursor (iA Writer style),
 * implemented as a content attribute so it toggles without recreating the view.
 */
const focusExtension = (on: boolean) =>
  EditorView.contentAttributes.of({ class: on ? "cm-focus-mode" : "" });

/** Read-only vs editable, toggled by manual-editing mode (read-first default). */
const editableExtension = (on: boolean) => [
  EditorState.readOnly.of(!on),
  EditorView.editable.of(on),
];

export function Editor({ paneFile }: { paneFile?: string } = {}) {
  const root = useProject((s) => s.root);
  const globalActive = useProject((s) => s.active);
  // The split (secondary) pane is driven by a prop; the primary pane follows the
  // global active file and owns the shared editor state (status bar, cursor…).
  const active = paneFile ?? globalActive;
  const primary = paneFile === undefined;
  const landing = useProject((s) => s.landing);
  const allComments = useComments((s) => s.comments);
  const archived = useComments((s) => s.archived);
  const reanchoringId = useComments((s) => s.reanchoringId);
  const diffing = useEditorActions((s) => s.diffing);
  const { wrap, readingWidth, codeFont, focusMode, renderWhitespace } = useSettings();
  const { t } = useTranslation();

  // The loaded content is kept together with the path it belongs to. Loading is
  // async, so binding content to its path prevents ever rendering one file's
  // bytes under another file's identity (which would desync the editor).
  const [loaded, setLoaded] = useState<{ path: string; content: FileContent } | null>(
    null,
  );
  const [error, setError] = useState<{ path: string; message: string } | null>(null);

  // Load the active file whenever it changes (or when forced to text).
  const forceText = useTextView((s) => s.force);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    readFile(root, active, forceText.has(active))
      .then((c) => !cancelled && setLoaded({ path: active, content: c }))
      .catch((e) => !cancelled && setError({ path: active, message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [root, active, forceText]);

  // Recompute this file's comment anchors on open (spec: recompute on open).
  useEffect(() => {
    if (!active) return;
    const rel = toRelative(root, active);
    reanchorFile(root, rel)
      .then((list) => useComments.getState().replaceForFile(rel, list))
      .catch(() => {});
  }, [root, active]);

  // Reload the open file when it changes on disk (e.g. an agent edited it),
  // unless the user has unsaved manual edits in progress.
  useEffect(() => {
    if (!active) return;
    const rel = toRelative(root, active);
    const un = listen<{ file: string }>("file-changed", (e) => {
      if (e.payload.file !== rel || useEditorActions.getState().dirty) return;
      readFile(root, active, forceText.has(active))
        .then((c) => setLoaded({ path: active, content: c }))
        .catch(() => {});
    });
    return () => {
      // Swallow a rejecting unlisten (Tauri's listener map can already be gone
      // on a fast file switch / StrictMode double-effect) so it never escapes as
      // an unhandled rejection.
      void un.then((off) => off()).catch(() => {});
    };
  }, [root, active, forceText]);

  // Each file opens with a clean default view: reset the dirty and diff state.
  // Only the primary pane owns this shared state.
  useEffect(() => {
    if (!primary) return;
    useEditorActions.getState().setDirty(false);
    useEditorActions.getState().setDiffing(false);
  }, [active, primary]);

  if (!active) {
    return <Welcome />;
  }
  if (error?.path === active) {
    return (
      <div
        role="alert"
        className={`${PLACEHOLDER} font-mono text-sm whitespace-pre-wrap text-marker`}
      >
        {error.message}
      </div>
    );
  }
  // Until the active file's content has loaded, show a neutral loading state
  // rather than a stale file.
  if (!loaded || loaded.path !== active) {
    return <div className={PLACEHOLDER}>{t("common.loading")}</div>;
  }
  const content = loaded.content;

  if (content.kind === "image") {
    return <ImageView dataUrl={content.dataUrl} name={active} />;
  }
  if (content.kind === "binary") {
    return (
      <div className={PLACEHOLDER} role="status">
        {t("editor.binary", { size: human(content.size) })}
      </div>
    );
  }

  const relPath = toRelative(root, active);

  // Markdown renders as prose by default; comments anchor to source lines, so a
  // toggle drops to the source view (CodeView) where the gutter/threads live.
  if (isMarkdown(active) && !diffing) {
    // While re-anchoring, force source: the prose view has no lines to select.
    const asSource = forceText.has(active) || reanchoringId !== null;
    const mdComments = commentsForFile(
      [...allComments, ...archived.filter((c) => c.state === "done")],
      relPath,
    );
    return (
      <div className="relative h-full w-full">
        <button
          type="button"
          onClick={() => useTextView.getState().toggleText(active)}
          title={asSource ? t("editor.viewRendered") : t("editor.viewSource")}
          className="absolute top-3 right-4 z-30 flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted shadow-[var(--shadow)] hover:text-ink"
        >
          {asSource ? <DocsIcon className="h-3.5 w-3.5" /> : <EditIcon className="h-3.5 w-3.5" />}
          {asSource ? t("editor.viewRendered") : t("editor.viewSource")}
          {!asSource && mdComments.length > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
              {mdComments.length}
            </span>
          )}
        </button>
        {asSource ? (
          <CodeView
            key={active}
            path={active}
            relPath={relPath}
            text={content.text}
            comments={mdComments}
            wrap={wrap}
            readingWidth={readingWidth}
            codeFont={codeFont}
            focusMode={focusMode}
            renderWhitespace={renderWhitespace}
            landingLine={landing?.path === active ? landing : null}
            primary={primary}
          />
        ) : (
          <div
            className="prose-reado mx-auto h-full w-full overflow-y-auto p-8"
            style={{ maxWidth: readingWidth ? "var(--reading-measure)" : undefined }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.text}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  if (diffing) {
    return <DiffView key={relPath} relPath={relPath} text={content.text} />;
  }
  // Show active comments plus resolved (done) ones, so a finished task stays
  // readable inline (marked done) instead of vanishing from the code.
  const fileComments = commentsForFile(
    [...allComments, ...archived.filter((c) => c.state === "done")],
    relPath,
  );
  return (
    <CodeView
      key={active}
      path={active}
      relPath={relPath}
      text={content.text}
      comments={fileComments}
      wrap={wrap}
      readingWidth={readingWidth}
      codeFont={codeFont}
      focusMode={focusMode}
      renderWhitespace={renderWhitespace}
      landingLine={landing?.path === active ? landing : null}
      primary={primary}
    />
  );
}

interface CodeViewProps {
  path: string;
  relPath: string;
  text: string;
  comments: Comment[];
  wrap: boolean;
  readingWidth: boolean;
  codeFont: string;
  focusMode: boolean;
  renderWhitespace: boolean;
  landingLine: { line: number; nonce: number } | null;
  /** Whether this is the primary pane (owns shared status-bar/cursor state). */
  primary: boolean;
}

/** The CodeMirror-backed read-only code viewer, with the comment overlay. */
function CodeView({
  path,
  relPath,
  text,
  comments,
  primary,
  wrap,
  readingWidth,
  codeFont,
  focusMode,
  renderWhitespace,
  landingLine,
}: CodeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const autoSaveTimer = useRef<number | undefined>(undefined);
  const wrapComp = useMemo(() => new Compartment(), []);
  const whitespaceComp = useMemo(() => new Compartment(), []);
  const langComp = useMemo(() => new Compartment(), []);
  const focusComp = useMemo(() => new Compartment(), []);
  const gutterComp = useMemo(() => new Compartment(), []);
  const blameComp = useMemo(() => new Compartment(), []);
  const bookmarkComp = useMemo(() => new Compartment(), []);
  const tabSizeComp = useMemo(() => new Compartment(), []);
  const lspComp = useMemo(() => new Compartment(), []);
  const blame = useEditorActions((s) => s.blame);
  const indentSize = useDocInfo((s) => s.indentSize);
  const languageOverride = useDocInfo((s) => s.languageOverride);
  const stickyScroll = useSettings((s) => s.stickyScroll);
  const setActiveThread = useComments((s) => s.setActive);
  const activeId = useComments((s) => s.activeId);
  const reanchoringId = useComments((s) => s.reanchoringId);
  const applyReanchor = useComments((s) => s.applyReanchor);
  const cancelReanchor = useComments((s) => s.cancelReanchor);
  const composeNonce = useEditorActions((s) => s.composeNonce);
  const reanchorLabel = useComments((s) => {
    const c = s.comments.find((x) => x.id === s.reanchoringId);
    return c?.messages[0]?.body.split("\n")[0] ?? "";
  });
  const lastComposeNonce = useRef(composeNonce);
  const explainNonce = useEditorActions((s) => s.explainNonce);
  const peekNonce = useEditorActions((s) => s.peekNonce);
  const lastExplainNonce = useRef(explainNonce);
  const lastPeekNonce = useRef(peekNonce);
  const { t } = useTranslation();

  // Comment-overlay state, local to this file's view.
  const [composer, setComposer] = useState<{
    startLine: number;
    endLine: number;
    context: Context;
    initialBody?: string;
    initialType?: CommentType;
  } | null>(null);
  // Line under the mouse, for the hover "+" add-comment affordance.
  const [hover, setHover] = useState<{ line: number; top: number } | null>(null);
  // Right-click context menu (screen position + the document offset clicked).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: number } | null>(
    null,
  );
  // Sticky scroll: the enclosing scope headers pinned above the viewport top.
  const [sticky, setSticky] = useState<{ line: number; text: string }[]>([]);
  // Peek definition: an inline preview of where the symbol at the cursor is
  // defined, without navigating away.
  const [peek, setPeek] = useState<{
    top: number;
    label: string;
    lines: string[];
    defLineIndex: number;
    target: { path: string; line: number } | null;
  } | null>(null);
  // Bumped on scroll/resize so the overlays re-read their anchor coordinates.
  const [, setTick] = useState(0);

  // Group comments by their anchored start line for the gutter. A line is shown
  // "done" (green) only when every comment on it is resolved.
  const lineComments = useMemo<LineComments>(() => {
    const map: LineComments = new Map();
    for (const c of comments) {
      if (c.anchor.scope !== "range") continue;
      const line = c.anchor.startLine;
      const entry = map.get(line) ?? { ids: [], done: true };
      entry.ids.push(c.id);
      entry.done = entry.done && (c.state === "done" || c.state === "discarded");
      map.set(line, entry);
    }
    return map;
  }, [comments]);

  // Reading bookmarks for this file → quiet gutter pins; clicking the gutter
  // toggles a bookmark (distinct from comments — no annotation, never sent to AI).
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const bookmarkLines = useMemo(() => {
    const set = new Set<number>();
    for (const b of bookmarks) if (b.path === relPath) set.add(b.line);
    return set;
  }, [bookmarks, relPath]);
  const toggleBookmarkLine = useMemo(
    () => (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const snippet = view.state.doc.line(line).text.trim().slice(0, 120);
      useBookmarks
        .getState()
        .toggle(useProject.getState().root, { path: relPath, line, snippet });
    },
    [relPath],
  );

  // Structure ribbon: marks for symbols, comment anchors, and diagnostics.
  const showRibbon = useSettings((s) => s.showRibbon);
  const diagByFile = useDiagnostics((s) => s.byFile[path]);
  const totalLines = useMemo(() => text.split("\n").length, [text]);
  const ribbonMarks = useMemo<RibbonMark[]>(() => {
    const out: RibbonMark[] = [];
    for (const s of extractSymbols(text)) out.push({ line: s.line, kind: "symbol" });
    for (const c of comments) {
      if (c.anchor.scope === "range") out.push({ line: c.anchor.startLine, kind: "comment" });
    }
    for (const d of diagByFile ?? []) {
      if (d.severity <= 2) out.push({ line: d.line, kind: d.severity === 1 ? "error" : "warn" });
    }
    return out;
  }, [text, comments, diagByFile]);
  const jumpToRibbon = (line: number) => {
    const view = viewRef.current;
    if (!view) return;
    const n = Math.max(1, Math.min(line, view.state.doc.lines));
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(n).from, { y: "center" }) });
  };
  // Visible range as percentages, recomputed each render (renders fire on scroll).
  const scrollerEl = hostRef.current?.querySelector(".cm-scroller") as HTMLElement | null;
  const ribbonBand =
    scrollerEl && scrollerEl.scrollHeight > scrollerEl.clientHeight + 4
      ? {
          top: (scrollerEl.scrollTop / scrollerEl.scrollHeight) * 100,
          height: (scrollerEl.clientHeight / scrollerEl.scrollHeight) * 100,
        }
      : null;

  // Open the thread for the topmost comment on a clicked gutter line.
  const openThreadAtLine = (_line: number, ids: string[]) => {
    setComposer(null);
    setActiveThread(ids[0]);
  };

  // Open the composer for a line range, capturing an adaptive context snapshot.
  // `prefill` seeds the body/type (e.g. a "Create task" from an LSP diagnostic).
  const openComposerFor = (
    startLine: number,
    endLine: number,
    prefill?: { body?: string; type?: CommentType },
  ) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const ctxStart = Math.max(1, startLine - 3);
    const ctxEnd = Math.min(doc.lines, endLine + 3);
    const slice = (a: number, b: number) =>
      doc.sliceString(doc.line(a).from, doc.line(b).to);
    const context: Context = {
      snippet: slice(startLine, endLine),
      before: ctxStart < startLine ? slice(ctxStart, startLine - 1) : "",
      after: ctxEnd > endLine ? slice(endLine + 1, ctxEnd) : "",
    };
    setActiveThread(null);
    setComposer({ startLine, endLine, context, initialBody: prefill?.body, initialType: prefill?.type });
  };

  // Save the buffer to disk (Cmd/Ctrl+S).
  const saveFile = () => {
    const view = viewRef.current;
    if (!view) return;
    noteSelfWrite(relPath); // our own save — don't let it mark the file unread
    writeFile(useProject.getState().root, relPath, view.state.doc.toString())
      .then(() => useEditorActions.getState().setDirty(false))
      .catch(() => {});
  };

  // Auto Save: write only when there are unsaved edits (avoids needless writes).
  const autoSave = () => {
    if (useEditorActions.getState().dirty) saveFile();
  };

  // In re-anchor mode the same gesture sets an orphan's new anchor instead of
  // opening the composer.
  const anchorOrCompose = (start: number, end: number) => {
    if (reanchoringId) applyReanchor(relPath, start, end);
    else openComposerFor(start, end);
  };

  // Dismiss the peek panel on Escape.
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPeek(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peek]);

  // Peek the definition of the symbol at the cursor in an inline panel. Prefers
  // the language server when one is attached, falling back to the symbol index.
  const peekDefinition = (): boolean => {
    const view = viewRef.current;
    if (!view) return false;
    const pos = view.state.selection.main.head;
    const word = view.state.wordAt(pos);
    if (!word) return false;
    const name = view.state.doc.sliceString(word.from, word.to);
    const top = toLocalTop(view.coordsAtPos(word.from)?.bottom ?? 0) ?? 8;
    const root = useProject.getState().root;
    // Render a peek panel for a resolved definition location.
    const showAt = async (path: string, line: number) => {
      const content = await readFile(root, path).catch(() => null);
      const text = content && content.kind === "text" ? content.text : "";
      const all = text.split("\n");
      const start = Math.max(0, line - 6);
      const lines = all.slice(start, Math.min(all.length, line + 6));
      setPeek({
        top,
        label: `${toRelative(root, path)}:${line}`,
        lines,
        defLineIndex: line - 1 - start,
        target: { path, line },
      });
    };
    const showNone = () =>
      setPeek({ top, label: name, lines: [], defLineIndex: -1, target: null });
    // Index fallback: search the symbol index by name.
    const fromIndex = () =>
      findDefinition(root, name)
        .then((defs) => (defs.length ? showAt(defs[0].path, defs[0].line) : showNone()))
        .catch(() => {});
    const fromServer = lspDefinition(view, pos);
    if (fromServer) {
      void fromServer.then((loc) => (loc ? showAt(loc.path, loc.line) : fromIndex()));
    } else {
      void fromIndex();
    }
    return true;
  };

  // Confirm re-anchoring to the current selection (or the cursor's line) — the
  // explicit button so it doesn't depend on knowing the keyboard gesture.
  const confirmReanchor = () => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    applyReanchor(relPath, doc.lineAt(sel.from).number, doc.lineAt(sel.to).number);
  };

  // Start the gesture from the current selection (or the cursor's line).
  const startComposer = (view: EditorView): boolean => {
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    anchorOrCompose(doc.lineAt(sel.from).number, doc.lineAt(sel.to).number);
    return true;
  };

  // From the hovered "+" affordance: act on the whole current selection when
  // there is one, otherwise on the hovered line alone.
  const composeFromHover = (line: number) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    if (!sel.empty) {
      const doc = view.state.doc;
      anchorOrCompose(doc.lineAt(sel.from).number, doc.lineAt(sel.to).number);
    } else {
      anchorOrCompose(line, line);
    }
  };

  // Respond to a compose request from the global shortcut / command palette.
  useEffect(() => {
    if (composeNonce === lastComposeNonce.current) return;
    lastComposeNonce.current = composeNonce;
    if (viewRef.current) startComposer(viewRef.current);
    // startComposer reads live editor state on call; no need to re-bind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeNonce]);

  // Explain / Peek requested from the palette or menu (primary pane only).
  useEffect(() => {
    if (explainNonce === lastExplainNonce.current) return;
    lastExplainNonce.current = explainNonce;
    if (primary) explainSelection(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainNonce]);
  useEffect(() => {
    if (peekNonce === lastPeekNonce.current) return;
    lastPeekNonce.current = peekNonce;
    if (primary) peekDefinition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekNonce]);

  // Create the editor once per file.
  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightSpecialChars(),
        drawSelection(),
        bracketMatching(),
        highlightSelectionMatches(),
        // Multiple cursors: Cmd/Ctrl+D adds the next occurrence, Alt+click adds a
        // caret, Alt+drag selects a column.
        EditorState.allowMultipleSelections.of(true),
        EditorView.clickAddsSelectionRange.of((e) => e.altKey),
        rectangularSelection(),
        crosshairCursor(),
        // Reading aids: highlight the symbol under the cursor, indentation guides,
        // and syntax-aware expand/shrink selection.
        occurrenceHighlight,
        indentationMarkers({ hideFirstIndent: true, highlightActiveBlock: false }),
        syntaxSelection,
        keymap.of([
          { key: "Shift-Alt-ArrowRight", run: expandSelection },
          { key: "Shift-Alt-ArrowLeft", run: shrinkSelection },
        ]),
        // Find & replace panel (Mod-F to find, Mod-Alt-F to replace).
        search({ top: true }),
        // Mirror the cursor position into the status bar; track unsaved edits.
        // Only the primary pane writes the shared cursor/dirty state.
        EditorView.updateListener.of((u) => {
          if (!primary) return;
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            useCursor.getState().set(line.number, head - line.from + 1);
          }
          if (u.docChanged && !u.transactions.some((tr) => tr.annotation(ExternalReload))) {
            useEditorActions.getState().setDirty(true);
            setLastEdit(u.state.selection.main.head);
            // Auto Save (after-delay): debounce a write while the user types.
            if (useSettings.getState().autoSave === "afterDelay") {
              clearTimeout(autoSaveTimer.current);
              autoSaveTimer.current = window.setTimeout(autoSave, 1000);
            }
          }
        }),
        // Auto Save (on-focus-change): write when the editor loses focus.
        EditorView.domEventHandlers({
          blur: () => {
            if (useSettings.getState().autoSave === "onFocusChange") autoSave();
            return false;
          },
        }),
        // "Create task" from an LSP diagnostic tooltip: open the composer for the
        // problem's line, prefilled with the message as an actionable task.
        EditorView.updateListener.of((u) => {
          for (const tr of u.transactions) {
            for (const eff of tr.effects) {
              if (eff.is(explainSymbolAt)) {
                explainSymbol(eff.value.pos);
                continue;
              }
              if (!eff.is(taskFromDiagnostic)) continue;
              const line = u.state.doc.lineAt(eff.value.from).number;
              openComposerFor(line, line, { body: eff.value.message, type: "bug" });
            }
          }
        }),
        landingField,
        blockField,
        linkField,
        filePathFacet.of(path),
        gotoDefinitionHandlers,
        // F12 jumps to the definition of the symbol at the cursor.
        keymap.of([
          { key: "F12", run: (v) => (goToDefinitionAt(v, v.state.selection.main.head), true) },
          { key: "Mod-F12", run: (v) => (goToImplementationAt(v, v.state.selection.main.head), true) },
        ]),
        // Go to line — Cmd/Ctrl+G (VS Code), alongside the default Cmd+Alt+G.
        keymap.of([{ key: "Mod-g", run: gotoLine }]),
        // Shift+F12 — find references (project-wide search for the symbol).
        keymap.of([{ key: "Shift-F12", run: findReferencesAt }]),
        // Alt+F12 — peek the definition inline.
        keymap.of([{ key: "Alt-F12", run: () => peekDefinition() }]),
        gutterComp.of(commentGutter(lineComments, openThreadAtLine)),
        bookmarkComp.of(bookmarkGutter(bookmarkLines, toggleBookmarkLine)),
        blameComp.of([]),
        lspComp.of([]),
        tabSizeComp.of(EditorState.tabSize.of(useDocInfo.getState().indentSize)),
        // Create-comment gesture (spec: a dedicated key on a selection).
        keymap.of([{ key: "Mod-Shift-m", run: startComposer }]),
        // Save when editing.
        keymap.of([{ key: "Mod-s", run: () => (saveFile(), true) }]),
        // Undo/redo: the history field plus its keymap (Mod-z / Mod-Shift-z).
        // These bindings live in historyKeymap, not defaultKeymap.
        history(),
        keymap.of([...historyKeymap, ...defaultKeymap, ...searchKeymap, ...foldKeymap]),
        // Editing is always available; read-first is about the clean default
        // view (no diff/AI overlay), not about being read-only.
        editableExtension(true),
        readoAppearance,
        // Mark diagnostics along the scrollbar so problems are easy to find.
        diagnosticsRuler,
        wrapComp.of(wrap ? EditorView.lineWrapping : []),
        whitespaceComp.of(renderWhitespace ? highlightWhitespace() : []),
        focusComp.of(focusExtension(focusMode)),
        langComp.of([]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    if (primary) useDocInfo.getState().set({ view });

    // Restore the saved scroll offset for this file, after first layout.
    const savedScroll =
      useSessions.getState().byRoot[useProject.getState().root]?.scroll?.[relPath];
    if (savedScroll) {
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.scrollDOM.scrollTop = savedScroll;
      });
    }

    // Detect and lazily load the language pack for this filename.
    const desc = LanguageDescription.matchFilename(languages, path);
    if (desc) {
      desc.load().then((support) => {
        view.dispatch({ effects: langComp.reconfigure(support) });
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (useDocInfo.getState().view === view) useDocInfo.getState().set({ view: null });
    };
    // `text`/`path` identity drives recreation via the `key` prop in Editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document when the file changed on disk (e.g. an agent edited
  // it). Skipped while the user has unsaved manual edits so we never clobber
  // them; tagged as an external reload so it doesn't mark the doc dirty.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === text) return;
    if (useEditorActions.getState().dirty) return;
    const sel = view.state.selection.main;
    const len = text.length;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: Math.min(sel.anchor, len), head: Math.min(sel.head, len) },
      annotations: ExternalReload.of(true),
    });
  }, [text]);

  // Reconfigure line wrapping live.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap, wrapComp]);

  // Toggle whitespace rendering live.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: whitespaceComp.reconfigure(renderWhitespace ? highlightWhitespace() : []),
    });
  }, [renderWhitespace, whitespaceComp]);

  // Connect the language server for this file (primary pane only, to avoid two
  // editors syncing the same document). Falls back to nothing when no server is
  // installed for the language.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!primary || !hasServer(path)) {
      view.dispatch({ effects: lspComp.reconfigure([]) });
      return;
    }
    let cancelled = false;
    lspSupport(useProject.getState().root, path).then((ext) => {
      if (!cancelled) viewRef.current?.dispatch({ effects: lspComp.reconfigure(ext ?? []) });
    });
    return () => {
      cancelled = true;
    };
  }, [path, primary, lspComp]);

  // Apply the (possibly status-bar-overridden) tab display width.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: tabSizeComp.reconfigure(EditorState.tabSize.of(indentSize)),
    });
  }, [indentSize, tabSizeComp]);

  // Apply a manual language-mode override picked from the status bar.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !languageOverride) return;
    const desc = languages.find((l) => l.name === languageOverride);
    if (!desc) {
      view.dispatch({ effects: langComp.reconfigure([]) }); // Plain Text
      return;
    }
    desc.load().then((support) => {
      viewRef.current?.dispatch({ effects: langComp.reconfigure(support) });
    });
  }, [languageOverride, langComp]);

  // Surface document info (line endings, indentation, language) to the status
  // bar. Detected from the raw text, since CodeMirror normalises line endings.
  // Only the primary pane drives the status bar.
  useEffect(() => {
    if (!primary) return;
    const desc = LanguageDescription.matchFilename(languages, path);
    const ext = path.split(".").pop() ?? "";
    const language = desc?.name ?? (ext ? ext.toUpperCase() : "Plain Text");
    const indent = detectIndent(text);
    useDocInfo.getState().set({
      eol: detectEol(text),
      indentKind: indent.kind,
      indentSize: indent.size,
      language,
      languageOverride: null,
    });
  }, [text, path, primary]);

  // Toggle focus mode live.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: focusComp.reconfigure(focusExtension(focusMode)),
    });
  }, [focusMode, focusComp]);

  // Rebuild the comment gutter when this file's comments change.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterComp.reconfigure(commentGutter(lineComments, openThreadAtLine)),
    });
    // openThreadAtLine is stable enough (only setters); rebuild on data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineComments, gutterComp]);

  // Rebuild the bookmark gutter when this file's bookmarks change.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: bookmarkComp.reconfigure(bookmarkGutter(bookmarkLines, toggleBookmarkLine)),
    });
  }, [bookmarkLines, toggleBookmarkLine, bookmarkComp]);

  // Fetch and show the blame gutter when blame mode is on; clear it when off.
  useEffect(() => {
    if (!blame) {
      viewRef.current?.dispatch({ effects: blameComp.reconfigure([]) });
      return;
    }
    let cancelled = false;
    gitBlame(useProject.getState().root, relPath)
      .then((lines) => {
        if (!cancelled && lines.length) {
          viewRef.current?.dispatch({ effects: blameComp.reconfigure(blameGutter(lines)) });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blame, relPath, blameComp]);

  // Highlight the anchored block while its thread is open.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const c = activeId ? comments.find((x) => x.id === activeId) : null;
    const block =
      c && c.anchor.scope === "range"
        ? { from: c.anchor.startLine, to: c.anchor.endLine }
        : null;
    view.dispatch({ effects: setBlock.of(block) });
  }, [activeId, comments]);

  // Re-position overlays as the editor scrolls or the window resizes, and
  // remember the scroll offset (debounced) so the session can restore it.
  useEffect(() => {
    const scroller = hostRef.current?.querySelector(".cm-scroller") as HTMLElement | null;
    let timer: number | undefined;
    // Auto-mark this file read once it's been scrolled to the bottom — only when
    // the file is actually scrollable, and only once per open so a manual
    // "unread" sticks for the session.
    let autoMarked = false;
    const maybeMarkRead = () => {
      if (autoMarked || !scroller) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 24) return; // not scrollable
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 24) {
        autoMarked = true;
        useReadProgress.getState().mark(useProject.getState().root, relPath, true);
      }
    };
    const bump = () => {
      setTick((n) => n + 1);
      computeSticky();
      maybeMarkRead();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        useSessions
          .getState()
          .saveScroll(useProject.getState().root, relPath, scroller?.scrollTop ?? 0);
      }, 300);
    };
    scroller?.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("resize", bump);
    return () => {
      window.clearTimeout(timer);
      scroller?.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, []);

  // Recompute (or clear) the sticky headers when the setting toggles.
  useEffect(() => {
    computeSticky();
    // computeSticky reads live refs/state; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyScroll]);

  // Scroll to and softly highlight the landing line after a jump.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !landingLine) return;
    const lineNo = Math.min(landingLine.line, view.state.doc.lines);
    const pos = view.state.doc.line(lineNo).from;
    view.dispatch({
      effects: [
        EditorView.scrollIntoView(pos, { y: "center" }),
        setLanding.of(lineNo),
      ],
    });
    const timer = setTimeout(() => {
      viewRef.current?.dispatch({ effects: setLanding.of(null) });
    }, 1400);
    return () => clearTimeout(timer);
  }, [landingLine]);

  // Convert a viewport y (from coordsAtPos / pointer events) into a top offset
  // within the overlay container, expressed in the container's LAYOUT pixels.
  //
  // getBoundingClientRect() reports *visual* pixels (scaled by the page zoom and
  // device-pixel ratio), but a CSS `top` is applied in *layout* pixels. Under
  // zoom the two differ, so the raw difference drifts further the lower the line
  // is. Dividing by the effective scale (visual height / layout height) makes the
  // overlay track its anchor at any zoom and window size.
  const toLocalTop = (viewportY: number): number | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const scale = wrap.offsetHeight ? rect.height / wrap.offsetHeight : 1;
    return (viewportY - rect.top) / scale;
  };

  // Pixel offset of a line's top, relative to the overlay container. Returns
  // null when the line is scrolled out of view (overlay is then hidden).
  const topForLine = (line: number): number | null => {
    const view = viewRef.current;
    if (!view) return null;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from);
    return coords ? toLocalTop(coords.top) : null;
  };

  // Pixel offset of a line's *bottom* edge, relative to the overlay container.
  const bottomForLine = (line: number): number | null => {
    const view = viewRef.current;
    if (!view) return null;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from);
    return coords ? toLocalTop(coords.bottom) : null;
  };

  // Keep an overlay of the given height fully within the editor viewport, so a
  // popover anchored near the bottom edge opens upward instead of clipping.
  const clampTop = (top: number | null, panelHeight: number): number | null => {
    if (top === null) return null;
    const wrapH = wrapRef.current?.clientHeight ?? 0;
    return Math.max(8, Math.min(top, wrapH - panelHeight - 8));
  };

  const openComment = activeId ? comments.find((c) => c.id === activeId) ?? null : null;
  const wrapH = wrapRef.current?.clientHeight ?? 0;
  const composerTop = clampTop(composer ? topForLine(composer.endLine) : null, 260);
  // The thread box hangs from the *bottom* of the last commented line and scrolls
  // with the code. It is shown only while that line is within the viewport, so
  // the connector always points at its anchor and never runs across unrelated
  // lines — when the anchor scrolls off-screen, the panel scrolls off with it.
  const rawThreadTop = openComment ? bottomForLine(openComment.anchor.endLine) : null;
  const threadTop =
    rawThreadTop !== null && rawThreadTop >= 0 && rawThreadTop <= wrapH
      ? rawThreadTop
      : null;

  const closeOverlays = () => {
    setComposer(null);
    setActiveThread(null);
  };

  // Recompute the sticky-scroll headers: walk up from the first visible line,
  // collecting scope openers ({ or :) of strictly decreasing indentation.
  const computeSticky = () => {
    const view = viewRef.current;
    if (!view || !useSettings.getState().stickyScroll) {
      setSticky([]);
      return;
    }
    const doc = view.state.doc;
    const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const topLine = doc.lineAt(topBlock.from).number;
    const indentOf = (s: string) => s.match(/^[\t ]*/)?.[0].length ?? 0;
    const isOpener = (s: string) => /[{:]$/.test(s.trim());

    const headers: { line: number; text: string }[] = [];
    let limit = Infinity;
    for (let n = topLine - 1; n >= 1 && headers.length < 5; n--) {
      const text = doc.line(n).text;
      if (!text.trim()) continue;
      const indent = indentOf(text);
      if (indent < limit && isOpener(text)) {
        headers.unshift({ line: n, text: text.replace(/\s+$/, "") });
        limit = indent;
        if (indent === 0) break;
      }
    }
    setSticky((prev) =>
      prev.length === headers.length && prev.every((h, i) => h.line === headers[i].line)
        ? prev
        : headers,
    );
  };

  // Open the editor context menu at the right-clicked position.
  const onContextMenu = (e: React.MouseEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, pos });
  };

  // Build the context-menu actions for the clicked position.
  // Ask the focused agent to explain the current selection (or cursor line),
  // optionally recording the explanation as an anchored note.
  const explainSelection = (asNote: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const prompt = composeExplainPrompt(
      relPath,
      doc.lineAt(sel.from).number,
      doc.lineAt(sel.to).number,
      asNote,
    );
    void dispatchToAgent(prompt);
  };

  // Explain a single symbol using the language server's hover docs as context
  // (great for external libraries), and let the agent leave a note on the line.
  const explainSymbol = (pos: number) => {
    const view = viewRef.current;
    if (!view) return;
    const word = view.state.wordAt(pos);
    if (!word) return;
    const symbol = view.state.doc.sliceString(word.from, word.to);
    const line = view.state.doc.lineAt(pos).number;
    lspHover(view, pos).then((docs) => {
      const prompt = composeSymbolExplainPrompt(relPath, line, symbol, docs ?? "");
      void dispatchToAgent(prompt);
    });
  };

  const ctxActions = () => {
    const view = viewRef.current;
    if (!view || !ctxMenu) return [];
    const pos = ctxMenu.pos;
    const word = view.state.wordAt(pos);
    const isRepo = useProject.getState().git.isRepo;
    // A language-server diagnostic at the clicked line — offered as a quick
    // "create task" so the problem can become an anchored task without hovering.
    const clickLine = view.state.doc.lineAt(pos);
    let diagMessage: string | null = null;
    forEachDiagnostic(view.state, (d, from, to) => {
      if (diagMessage) return;
      if (to >= clickLine.from && from <= clickLine.to) diagMessage = d.message;
    });
    return [
      word && {
        label: t("editor.goToDef"),
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
      diagMessage && {
        label: t("lsp.createTaskFromProblem"),
        run: () => openComposerFor(clickLine.number, clickLine.number, { body: diagMessage!, type: "bug" }),
      },
      {
        label: t("comment.new"),
        run: () => {
          const line = view.state.doc.lineAt(pos).number;
          openComposerFor(line, line);
        },
      },
      { label: t("editor.explain"), run: () => explainSelection(false) },
      { label: t("editor.explainNote"), run: () => explainSelection(true) },
      { label: t("editor.format"), run: () => void formatDocument() },
      isRepo && {
        label: t("diff.toggle"),
        run: () => useEditorActions.getState().setDiffing(!useEditorActions.getState().diffing),
      },
    ].filter(Boolean) as { label: string; run: () => void }[];
  };

  // Track the hovered line to show the "+" add-comment affordance.
  const onMouseMove = (e: React.MouseEvent) => {
    const view = viewRef.current;
    if (!view || !wrapRef.current) return;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const line = view.state.doc.lineAt(pos).number;
    const coords = view.coordsAtPos(view.state.doc.line(line).from);
    if (!coords) return;
    const top = toLocalTop(coords.top);
    if (top === null) return;
    setHover((prev) => (prev?.line === line ? prev : { line, top }));
  };

  const showAddButton = hover && !composer && !openComment;

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto h-full w-full"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      onContextMenu={onContextMenu}
      style={
        {
          "--code-font": codeFont || undefined,
          maxWidth: readingWidth ? "var(--reading-measure)" : undefined,
        } as React.CSSProperties
      }
    >
      <div ref={hostRef} className="h-full w-full [&_.cm-editor]:h-full" />

      {showRibbon && (
        <StructureRibbon
          marks={ribbonMarks}
          totalLines={totalLines}
          band={ribbonBand}
          onJump={jumpToRibbon}
        />
      )}

      {sticky.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-line bg-canvas">
          {sticky.map((h) => (
            <button
              key={h.line}
              type="button"
              onClick={() => {
                const v = viewRef.current;
                if (!v) return;
                const line = v.state.doc.line(Math.min(h.line, v.state.doc.lines));
                v.dispatch({
                  selection: { anchor: line.from },
                  effects: EditorView.scrollIntoView(line.from, { y: "start" }),
                });
                v.focus();
              }}
              title={t("editor.stickyJump")}
              className="pointer-events-auto block w-full overflow-hidden text-left whitespace-pre text-muted hover:bg-surface hover:text-ink"
              style={{
                paddingLeft:
                  (hostRef.current?.querySelector(".cm-gutters") as HTMLElement | null)
                    ?.clientWidth ?? 40,
                fontFamily: "var(--code-font, var(--font-code))",
                fontSize: "var(--text-md)",
                lineHeight: "var(--code-line-height)",
              }}
            >
              {h.text}
            </button>
          ))}
        </div>
      )}

      {reanchoringId && (
        <div className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-line bg-[color-mix(in_oklch,var(--marker)_14%,var(--bg-elevated))] px-4 py-2 text-xs text-ink">
          <span className="min-w-0 flex-1 truncate">
            {t("orphans.reanchorHint", { label: reanchorLabel })}
          </span>
          <button
            type="button"
            onClick={confirmReanchor}
            className="flex-none rounded-md bg-accent px-2 py-1 font-semibold text-on-accent hover:brightness-110"
          >
            {t("orphans.confirm")}
          </button>
          <button
            type="button"
            onClick={cancelReanchor}
            className="flex-none rounded-md border border-line bg-surface px-2 py-1 text-muted hover:text-ink"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {/* Peek definition: an inline preview anchored under the symbol. */}
      {peek && (
        <div
          className="absolute left-1/2 z-50 w-[min(680px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
          style={{ top: peek.top + 4 }}
        >
          <header className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-muted">
              {peek.target ? peek.label : t("peek.none", { name: peek.label })}
            </span>
            {peek.target && (
              <button
                type="button"
                onClick={() => {
                  useProject.getState().open(peek.target!.path, peek.target!.line);
                  setPeek(null);
                }}
                className="flex-none rounded-md px-2 py-0.5 text-muted hover:bg-surface hover:text-ink"
              >
                {t("peek.open")}
              </button>
            )}
            <button
              type="button"
              title={t("common.cancel")} aria-label={t("common.cancel")}
              onClick={() => setPeek(null)}
              className="grid h-5 w-5 flex-none place-items-center rounded-md text-faint hover:text-ink"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </header>
          {peek.target && (
            <pre className="max-h-56 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-ink">
              {peek.lines.map((l, i) => (
                <div
                  key={i}
                  className={i === peek.defLineIndex ? "bg-selection" : undefined}
                >
                  {l || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}

      {showAddButton && (
        <button
          type="button"
          title={t("comment.new")}
          aria-label={t("comment.new")}
          onClick={() => composeFromHover(hover.line)}
          style={{ top: hover.top }}
          className="absolute right-4 z-20 grid h-[18px] w-[18px] -translate-y-px place-items-center rounded-md border border-line-strong bg-surface text-muted shadow-[var(--shadow)] transition-colors hover:bg-accent hover:text-on-accent"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
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
      {openComment &&
        threadTop !== null &&
        (() => {
          // Start may sit above the viewport on a multi-line anchor; clamp the
          // rail to the top edge so the connector still draws.
          const startTop = topForLine(openComment.anchor.startLine) ?? 0;
          const w = wrapRef.current?.clientWidth ?? 0;
          const xBoxRight = w - 16; // the box's right edge (it sits at right-4)
          const xRail = 6; // in the line-number gutter, far left
          const hY = threadTop; // top edge of the box = run below the last line
          const r = 8; // matches the box's rounded-lg corner
          const down = 64; // how far the rail traces down the box's right edge
          const multi = openComment.anchor.endLine > openComment.anchor.startLine;
          const accent = ACCENT(openComment.type);
          // The line is the same colour as the box, so it goes flat into it and
          // shows only as a faint tail over the code. The vertical rail stays
          // thin; the horizontal run (along the box's top edge, the convex
          // top-RIGHT corner, then down the right side) is heavier.
          const vertical = `M ${xRail} ${Math.min(startTop, hY)} L ${xRail} ${hY}`;
          const horizontal =
            `M ${xRail} ${hY} L ${xBoxRight - r} ${hY}` +
            ` Q ${xBoxRight} ${hY} ${xBoxRight} ${hY + r} L ${xBoxRight} ${hY + down}`;
          return (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            >
              {multi && (
                <path
                  d={vertical}
                  fill="none"
                  stroke={accent}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <path
                d={horizontal}
                fill="none"
                stroke={accent}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        })()}

      {openComment && threadTop !== null && (
        <CommentThread
          comment={openComment}
          top={threadTop}
          onClose={closeOverlays}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxActions().map((a) => ({ label: a.label, onSelect: a.run }))}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
