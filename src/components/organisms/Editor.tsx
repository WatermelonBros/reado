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
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  readFile,
  reanchorFile,
  gitShowRef,
  gitDiffLines,
  type FileContent,
} from "../../lib/api";
import { useComments, commentsForFile, toRelative } from "../../lib/comments";
import { useTextView } from "../../lib/textView";
import { useGuidedReview, prRefsFor } from "../../lib/guidedReview";
import {
  useEditorActions,
  useProject,
  useSettings,
} from "../../lib/store";

import { Welcome } from "../molecules/Welcome";
import { DiffView } from "../organisms/DiffView";
import { ImageView } from "../organisms/ImageView";
import { DocsIcon, EditIcon } from "../atoms/icons";
import { Badge } from "../atoms/Badge";
import { useTranslation } from "react-i18next";

import { RenderedMarkdown } from "./editor/RenderedMarkdown";
import { CodeView } from "./editor/CodeView";
import { PLACEHOLDER, human, isMarkdown } from "./editor/extensions";

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
  const { wrap, codeFont, focusMode, renderWhitespace } = useSettings();
  const showResolvedComments = useSettings((s) => s.showResolvedComments);
  // The comments shown inline: open ones always; resolved (done) ones only when
  // the setting allows — hiding them declutters without touching the data.
  const inlineCommentSource = useMemo(
    () =>
      showResolvedComments
        ? [...allComments, ...archived.filter((c) => c.state === "done")]
        : allComments.filter((c) => c.state !== "done" && c.state !== "discarded"),
    [allComments, archived, showResolvedComments],
  );
  const { t } = useTranslation();

  // The loaded content is kept together with the path it belongs to. Loading is
  // async, so binding content to its path prevents ever rendering one file's
  // bytes under another file's identity (which would desync the editor).
  const [loaded, setLoaded] = useState<{ path: string; content: FileContent } | null>(
    null,
  );
  const [error, setError] = useState<{ path: string; message: string } | null>(null);

  // When a PR is under in-place review, its files are read from the fetched git
  // ref (never checked out) so the editor shows the PR's version — not the user's
  // working tree — and the imported/proposed comments line up with it.
  const prSession = useGuidedReview((s) => {
    const sess = s.sessions.find((x) => x.id === s.currentId);
    return sess && sess.scope.kind === "pr" ? sess : null;
  });
  const prRefs = useMemo(() => {
    if (!prSession || !active) return null;
    const rel = toRelative(root, active);
    const inScope =
      (prSession.route ?? []).some((e) => e.file === rel) ||
      (prSession.files ?? []).some((f) => f.file === rel);
    return inScope ? (prRefsFor(prSession.scope) ?? null) : null;
  }, [prSession, active, root]);
  const prRef = prRefs?.head ?? null;

  // The lines the PR changed, marked inline in the code view (so the diff is
  // visible without leaving the reliable, commentable view).
  const [changedLines, setChangedLines] = useState<Array<[number, number]>>([]);
  useEffect(() => {
    if (!prRefs || !active) {
      setChangedLines([]);
      return;
    }
    let cancelled = false;
    const rel = toRelative(root, active);
    gitDiffLines(root, rel, prRefs.base, prRefs.head)
      .then((r) => !cancelled && setChangedLines(r))
      .catch(() => !cancelled && setChangedLines([]));
    return () => {
      cancelled = true;
    };
  }, [prRefs, active, root]);

  // Load the active file whenever it changes (or when forced to text). In PR
  // mode the bytes come from the ref (`git show`), falling back to the working
  // tree if the path isn't in the ref (e.g. a binary or deleted file).
  const forceText = useTextView((s) => s.force);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const rel = toRelative(root, active);
    const load: Promise<FileContent> = prRef
      ? gitShowRef(root, rel, prRef).then((text) =>
          text == null
            ? readFile(root, active, forceText.has(active))
            : ({ kind: "text", text }),
        )
      : readFile(root, active, forceText.has(active));
    load
      .then((c) => !cancelled && setLoaded({ path: active, content: c }))
      .catch((e) => !cancelled && setError({ path: active, message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [root, active, forceText, prRef]);

  // Recompute this file's comment anchors on open (spec: recompute on open).
  // Skipped in PR mode: reanchoring reads the working tree, but the shown bytes
  // are the PR's — the comments are already anchored to those exact lines.
  useEffect(() => {
    if (!active || prRef) return;
    const rel = toRelative(root, active);
    reanchorFile(root, rel)
      .then((list) => useComments.getState().replaceForFile(rel, list))
      .catch(() => {});
  }, [root, active, prRef]);

  // Reload the open file when it changes on disk (e.g. an agent edited it),
  // unless the user has unsaved manual edits in progress.
  useEffect(() => {
    if (!active) return;
    const rel = toRelative(root, active);
    const un = listen<{ file: string }>("file-changed", (e) => {
      // In PR mode the shown bytes come from the ref, not disk — ignore writes.
      if (e.payload.file !== rel || useEditorActions.getState().dirty || prRef) return;
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
  }, [root, active, forceText, prRef]);

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
    const mdComments = commentsForFile(inlineCommentSource, relPath);
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
            <Badge tone="accent">{mdComments.length}</Badge>
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
            codeFont={codeFont}
            focusMode={focusMode}
            renderWhitespace={renderWhitespace}
            landingLine={landing?.path === active ? landing : null}
            primary={primary}
            pinned={prRef != null}
            changedLines={changedLines}
          />
        ) : (
          <RenderedMarkdown text={content.text} />
        )}
      </div>
    );
  }

  if (diffing) {
    // In PR review, diff the PR head (what's shown) against the PR base ref —
    // not the working tree's HEAD, which is the reviewer's own branch.
    return (
      <DiffView key={relPath} relPath={relPath} text={content.text} base={prRefs?.base} />
    );
  }
  // Open comments inline; resolved ones too when the setting allows (see
  // `inlineCommentSource`), so a finished task stays readable unless hidden.
  const fileComments = commentsForFile(inlineCommentSource, relPath);
  return (
    <CodeView
      key={active}
      path={active}
      relPath={relPath}
      text={content.text}
      comments={fileComments}
      wrap={wrap}
      codeFont={codeFont}
      focusMode={focusMode}
      renderWhitespace={renderWhitespace}
      landingLine={landing?.path === active ? landing : null}
      primary={primary}
      pinned={prRef != null}
      changedLines={changedLines}
    />
  );
}
