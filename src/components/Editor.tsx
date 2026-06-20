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
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  readFile,
  reanchorFile,
  writeFile,
  gitBlame,
  findDefinition,
  type Comment,
  type Context,
  type FileContent,
} from "../lib/api";
import { readoAppearance } from "../lib/codemirror";
import { commentGutter, type LineComments } from "../lib/commentGutter";
import { blameGutter } from "../lib/blameGutter";
import { useDocInfo, detectEol, detectIndent, formatDocument } from "../lib/docInfo";
import { useComments, commentsForFile, toRelative } from "../lib/comments";
import {
  useCursor,
  useEditorActions,
  useProject,
  useSessions,
  useSettings,
} from "../lib/store";
import { useT } from "../i18n";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import { ACCENT } from "./commentMeta";
import { Welcome } from "./Welcome";
import { DiffView } from "./DiffView";
import { ImageView } from "./ImageView";
import { ContextMenu } from "./ui/ContextMenu";
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

/** Resolve the identifier at `pos` to its definition and jump there. */
function goToDefinitionAt(view: EditorView, pos: number) {
  const word = view.state.wordAt(pos);
  if (!word) return;
  const name = view.state.doc.sliceString(word.from, word.to);
  findDefinition(useProject.getState().root, name)
    .then((defs) => {
      if (defs.length) useProject.getState().open(defs[0].path, defs[0].line);
    })
    .catch(() => {});
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

export function Editor() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const landing = useProject((s) => s.landing);
  const allComments = useComments((s) => s.comments);
  const diffing = useEditorActions((s) => s.diffing);
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

  // Each file opens with a clean default view: reset the dirty and diff state.
  useEffect(() => {
    useEditorActions.getState().setDirty(false);
    useEditorActions.getState().setDiffing(false);
  }, [active]);

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
  if (diffing) {
    return <DiffView key={relPath} relPath={relPath} text={content.text} />;
  }
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
  const blameComp = useMemo(() => new Compartment(), []);
  const tabSizeComp = useMemo(() => new Compartment(), []);
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
  const t = useT();

  // Comment-overlay state, local to this file's view.
  const [composer, setComposer] = useState<{
    startLine: number;
    endLine: number;
    context: Context;
  } | null>(null);
  // Line under the mouse, for the hover "+" add-comment affordance.
  const [hover, setHover] = useState<{ line: number; top: number } | null>(null);
  // Right-click context menu (screen position + the document offset clicked).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: number } | null>(
    null,
  );
  // Sticky scroll: the enclosing scope headers pinned above the viewport top.
  const [sticky, setSticky] = useState<{ line: number; text: string }[]>([]);
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

  // Save the buffer to disk (Cmd/Ctrl+S).
  const saveFile = () => {
    const view = viewRef.current;
    if (!view) return;
    writeFile(useProject.getState().root, relPath, view.state.doc.toString())
      .then(() => useEditorActions.getState().setDirty(false))
      .catch(() => {});
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
        // Find & replace panel (Mod-F to find, Mod-Alt-F to replace).
        search({ top: true }),
        // Mirror the cursor position into the status bar; track unsaved edits.
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            useCursor.getState().set(line.number, head - line.from + 1);
          }
          if (u.docChanged) useEditorActions.getState().setDirty(true);
        }),
        landingField,
        blockField,
        linkField,
        gotoDefinitionHandlers,
        // F12 jumps to the definition of the symbol at the cursor.
        keymap.of([
          { key: "F12", run: (v) => (goToDefinitionAt(v, v.state.selection.main.head), true) },
        ]),
        gutterComp.of(commentGutter(lineComments, openThreadAtLine)),
        blameComp.of([]),
        tabSizeComp.of(EditorState.tabSize.of(useDocInfo.getState().indentSize)),
        // Create-comment gesture (spec: a dedicated key on a selection).
        keymap.of([{ key: "Mod-Shift-m", run: startComposer }]),
        // Save when editing.
        keymap.of([{ key: "Mod-s", run: () => (saveFile(), true) }]),
        keymap.of([...defaultKeymap, ...searchKeymap, ...foldKeymap]),
        // Editing is always available; read-first is about the clean default
        // view (no diff/AI overlay), not about being read-only.
        editableExtension(true),
        readoAppearance,
        wrapComp.of(wrap ? EditorView.lineWrapping : []),
        focusComp.of(focusExtension(focusMode)),
        langComp.of([]),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    useDocInfo.getState().set({ view });

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

  // Reconfigure line wrapping live.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap, wrapComp]);

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
  useEffect(() => {
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
  }, [text, path]);

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
    const bump = () => {
      setTick((n) => n + 1);
      computeSticky();
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

  // Pixel offset of a line's *bottom* edge, relative to the overlay container.
  const bottomForLine = (line: number): number | null => {
    const view = viewRef.current;
    if (!view || !wrapRef.current) return null;
    const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
    const coords = view.coordsAtPos(view.state.doc.line(clamped).from);
    if (!coords) return null;
    return coords.bottom - wrapRef.current.getBoundingClientRect().top;
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
  // The thread box hangs from the *bottom* of the last commented line, so the
  // connector's horizontal run sits below the code (never crossing it).
  const threadTop = clampTop(
    openComment ? bottomForLine(openComment.anchor.endLine) : null,
    Math.min(wrapH * 0.7, 420),
  );

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
  const ctxActions = () => {
    const view = viewRef.current;
    if (!view || !ctxMenu) return [];
    const pos = ctxMenu.pos;
    const word = view.state.wordAt(pos);
    const isRepo = useProject.getState().git.isRepo;
    return [
      word && {
        label: t("editor.goToDef"),
        run: () => goToDefinitionAt(view, pos),
      },
      {
        label: t("comment.new"),
        run: () => {
          const line = view.state.doc.lineAt(pos).number;
          openComposerFor(line, line);
        },
      },
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
      onContextMenu={onContextMenu}
      style={
        {
          "--code-font": codeFont || undefined,
          maxWidth: readingWidth ? "var(--reading-measure)" : undefined,
        } as React.CSSProperties
      }
    >
      <div ref={hostRef} className="h-full w-full [&_.cm-editor]:h-full" />

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

      {/* A bracket that wraps the commented lines and flows into the thread box
          as a single shape: a vertical rail in the line-number gutter spanning
          every commented line, a horizontal run below the last line, and a
          rounded (never square) turn into the box's top-left corner. Drawn in
          the box's own colour/outline so line and box read as one object. */}
      {openComment &&
        threadTop !== null &&
        (() => {
          const startTop = topForLine(openComment.anchor.startLine);
          if (startTop === null) return null;
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
