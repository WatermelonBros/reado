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
import { EditorState, Compartment, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  drawSelection,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import {
  foldGutter,
  bracketMatching,
  foldKeymap,
  LanguageDescription,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readFile, reanchorFile, type Comment, type Context, type FileContent } from "../lib/api";
import { readoAppearance } from "../lib/codemirror";
import { commentGutter, type LineComments } from "../lib/commentGutter";
import { useComments, commentsForFile, toRelative } from "../lib/comments";
import { useCursor, useEditorActions, useProject, useSettings } from "../lib/store";
import { useT } from "../i18n";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import { PlusIcon } from "./icons";

/** Shared layout for the non-code placeholder states (empty / loading / binary). */
const PLACEHOLDER = "grid h-full place-items-center p-8 text-center text-muted";

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

export function Editor() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const landing = useProject((s) => s.landing);
  const allComments = useComments((s) => s.comments);
  const { wrap, readingWidth, codeFont, focusMode } = useSettings();
  const t = useT();

  // The loaded content is kept together with the path it belongs to. Loading is
  // async, so binding content to its path prevents ever rendering one file's
  // bytes under another file's identity (which would desync the editor).
  const [loaded, setLoaded] = useState<{ path: string; content: FileContent } | null>(
    null,
  );
  const [error, setError] = useState<{ path: string; message: string } | null>(null);

  // Load the active file whenever it changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    readFile(root, active)
      .then((c) => !cancelled && setLoaded({ path: active, content: c }))
      .catch((e) => !cancelled && setError({ path: active, message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [root, active]);

  // Recompute this file's comment anchors on open (spec: recompute on open).
  useEffect(() => {
    if (!active) return;
    const rel = toRelative(root, active);
    reanchorFile(root, rel)
      .then((list) => useComments.getState().replaceForFile(rel, list))
      .catch(() => {});
  }, [root, active]);

  if (!active) {
    return (
      <div className={PLACEHOLDER} role="status">
        {t("editor.empty")}
      </div>
    );
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
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-8">
        <img
          src={content.dataUrl}
          alt={active}
          className="max-h-full max-w-full rounded-md shadow-[var(--shadow)]"
        />
      </div>
    );
  }
  if (content.kind === "binary") {
    return (
      <div className={PLACEHOLDER} role="status">
        {t("editor.binary", { size: human(content.size) })}
      </div>
    );
  }

  if (isMarkdown(active)) {
    return (
      <div
        className="prose-reado mx-auto h-full w-full overflow-y-auto p-8"
        style={{ maxWidth: readingWidth ? "var(--reading-measure)" : undefined }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.text}</ReactMarkdown>
      </div>
    );
  }

  const relPath = toRelative(root, active);
  return (
    <CodeView
      key={active}
      path={active}
      relPath={relPath}
      text={content.text}
      comments={commentsForFile(allComments, relPath)}
      wrap={wrap}
      readingWidth={readingWidth}
      codeFont={codeFont}
      focusMode={focusMode}
      landingLine={landing?.path === active ? landing : null}
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
  landingLine: { line: number; nonce: number } | null;
}

/** The CodeMirror-backed read-only code viewer, with the comment overlay. */
function CodeView({
  path,
  relPath,
  text,
  comments,
  wrap,
  readingWidth,
  codeFont,
  focusMode,
  landingLine,
}: CodeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapComp = useMemo(() => new Compartment(), []);
  const langComp = useMemo(() => new Compartment(), []);
  const focusComp = useMemo(() => new Compartment(), []);
  const gutterComp = useMemo(() => new Compartment(), []);
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
  const t = useT();

  // Comment-overlay state, local to this file's view.
  const [composer, setComposer] = useState<{
    startLine: number;
    endLine: number;
    context: Context;
  } | null>(null);
  // Line under the mouse, for the hover "+" add-comment affordance.
  const [hover, setHover] = useState<{ line: number; top: number } | null>(null);
  // Bumped on scroll/resize so the overlays re-read their anchor coordinates.
  const [, setTick] = useState(0);

  // Group comments by their anchored start line for the gutter.
  const lineComments = useMemo<LineComments>(() => {
    const map: LineComments = new Map();
    for (const c of comments) {
      if (c.anchor.scope !== "range") continue;
      const line = c.anchor.startLine;
      const ids = map.get(line) ?? [];
      ids.push(c.id);
      map.set(line, ids);
    }
    return map;
  }, [comments]);

  // Open the thread for the topmost comment on a clicked gutter line.
  const openThreadAtLine = (_line: number, ids: string[]) => {
    setComposer(null);
    setActiveThread(ids[0]);
  };

  // Open the composer for a line range, capturing an adaptive context snapshot.
  const openComposerFor = (startLine: number, endLine: number) => {
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
    setComposer({ startLine, endLine, context });
  };

  // In re-anchor mode the same gesture sets an orphan's new anchor instead of
  // opening the composer.
  const anchorOrCompose = (start: number, end: number) => {
    if (reanchoringId) applyReanchor(relPath, start, end);
    else openComposerFor(start, end);
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
        // Mirror the cursor position into the status bar.
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            useCursor.getState().set(line.number, head - line.from + 1);
          }
        }),
        landingField,
        gutterComp.of(commentGutter(lineComments, openThreadAtLine)),
        // Create-comment gesture (spec: a dedicated key on a selection).
        keymap.of([{ key: "Mod-Shift-m", run: startComposer }]),
        keymap.of([...defaultKeymap, ...searchKeymap, ...foldKeymap]),
        // Read-first: the viewer is non-editable by default. Manual editing
        // (task 1.8) will swap this for a writable configuration.
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        readoAppearance,
        wrapComp.of(wrap ? EditorView.lineWrapping : []),
        focusComp.of(focusExtension(focusMode)),
        langComp.of([]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

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
    };
    // `text`/`path` identity drives recreation via the `key` prop in Editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure line wrapping live.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap, wrapComp]);

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

  // Re-position overlays as the editor scrolls or the window resizes.
  useEffect(() => {
    const scroller = hostRef.current?.querySelector(".cm-scroller");
    const bump = () => setTick((n) => n + 1);
    scroller?.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("resize", bump);
    return () => {
      scroller?.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, []);

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

  // Pixel offset of a line's top, relative to the overlay container. Returns
  // null when the line is scrolled out of view (overlay is then hidden).
  const topForLine = (line: number): number | null => {
    const view = viewRef.current;
    if (!view || !wrapRef.current) return null;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from);
    if (!coords) return null;
    return coords.top - wrapRef.current.getBoundingClientRect().top;
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
  const threadTop = clampTop(
    openComment ? topForLine(openComment.anchor.startLine) : null,
    Math.min(wrapH * 0.7, 420),
  );

  const closeOverlays = () => {
    setComposer(null);
    setActiveThread(null);
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
    const top = coords.top - wrapRef.current.getBoundingClientRect().top;
    setHover((prev) => (prev?.line === line ? prev : { line, top }));
  };

  const showAddButton = hover && !composer && !openComment;

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto h-full w-full"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      style={
        {
          "--code-font": codeFont || undefined,
          maxWidth: readingWidth ? "var(--reading-measure)" : undefined,
        } as React.CSSProperties
      }
    >
      <div ref={hostRef} className="h-full w-full [&_.cm-editor]:h-full" />

      {reanchoringId && (
        <div className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-line bg-[color-mix(in_oklch,var(--marker)_14%,var(--bg-elevated))] px-4 py-2 text-xs text-ink">
          <span className="min-w-0 flex-1 truncate">
            {t("orphans.reanchorHint", { label: reanchorLabel })}
          </span>
          <button
            type="button"
            onClick={cancelReanchor}
            className="flex-none rounded-md border border-line bg-surface px-2 py-1 text-muted hover:text-ink"
          >
            {t("common.cancel")}
          </button>
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
          top={composerTop}
          onClose={closeOverlays}
        />
      )}

      {openComment && threadTop !== null && (
        <CommentThread
          comment={openComment}
          top={threadTop}
          onClose={closeOverlays}
        />
      )}
    </div>
  );
}
