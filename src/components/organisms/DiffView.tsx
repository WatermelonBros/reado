/**
 * On-demand diff view: the active file vs its committed (HEAD) version.
 *
 * This is how you see what changed — including the agent's own edits — without
 * leaving the reader. It's opt-in (the default view is clean code) and
 * read-only, rendered as a CodeMirror unified merge against the git base.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "../../lib/languages";
import {
  unifiedMergeView,
  goToNextChunk,
  goToPreviousChunk,
  getChunks,
} from "@codemirror/merge";

import { gitShowRef, getReadSnapshot } from "../../lib/api";
import { readoAppearance } from "../../lib/codemirror";
import { diffRuler } from "../../lib/overviewRuler";
import { useProject, useSettings, useEditorActions } from "../../lib/store";
import { useReadProgress, LAST_READ_BASE } from "../../lib/readProgress";

import { ChevronIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

interface Props {
  relPath: string;
  text: string;
  /** Override the git base to diff against (PR review diffs head vs the PR base
   *  ref, not the working tree's HEAD). Falls back to the shared diff base. */
  base?: string;
}

export function DiffView({ relPath, text, base: baseOverride }: Props) {
  const root = useProject((s) => s.root);
  const storeBase = useEditorActions((s) => s.diffBase);
  const base = baseOverride ?? storeBase;
  const { codeFont } = useSettings();
  const { t } = useTranslation();
  const [head, setHead] = useState<string | null | undefined>(undefined);
  // Delta mode: diff against the last-read snapshot rather than a git ref.
  const isDelta = base === LAST_READ_BASE;

  // Fetch the base version whenever the file or chosen base changes.
  useEffect(() => {
    let cancelled = false;
    setHead(undefined);
    const fetchBase = isDelta
      ? getReadSnapshot(root, relPath)
      : gitShowRef(root, relPath, base);
    fetchBase
      .then((h) => !cancelled && setHead(h))
      .catch(() => !cancelled && setHead(null));
    return () => {
      cancelled = true;
    };
  }, [root, relPath, base, isDelta]);

  // "Mark reviewed": re-snapshot the current content as read and leave the delta.
  const markReviewed = () => {
    useReadProgress.getState().mark(root, relPath, true, text);
    useReadProgress.getState().clearChanged(relPath);
    useEditorActions.getState().setDiffBase("HEAD");
    useEditorActions.getState().setDiffing(false);
  };

  if (head === undefined) {
    return <div className="grid h-full place-items-center text-muted">{t("common.loading")}</div>;
  }
  if (head === null) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
        {isDelta ? t("delta.noBase") : t("diff.noBase")}
      </div>
    );
  }
  if (head === text) {
    return (
      <div className="grid h-full place-items-center gap-3 p-8 text-center text-sm text-muted">
        {isDelta ? t("delta.noChanges") : t("diff.noChanges")}
        {isDelta && (
          <button
            type="button"
            onClick={markReviewed}
            className="rounded-md border border-line bg-surface px-3 py-1 text-xs text-ink hover:border-accent/40"
          >
            {t("delta.markReviewed")}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      <DiffEditor
        key={`${relPath}@${base}`}
        path={relPath}
        original={head}
        text={text}
        codeFont={codeFont}
      />
      {isDelta && (
        <button
          type="button"
          onClick={markReviewed}
          title={t("delta.markReviewed")}
          className="absolute top-3 left-4 z-10 rounded-md border border-line bg-overlay px-2.5 py-1 text-xs text-muted shadow-[var(--shadow)] hover:text-ink"
        >
          {t("delta.markReviewed")}
        </button>
      )}
    </div>
  );
}

function DiffEditor({
  path,
  original,
  text,
  codeFont,
}: {
  path: string;
  original: string;
  text: string;
  codeFont: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langComp = useMemo(() => new Compartment(), []);
  const { t } = useTranslation();
  const [chunkCount, setChunkCount] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          // Jump between changed regions with Alt+Up/Down.
          keymap.of([
            { key: "Alt-ArrowDown", run: goToNextChunk },
            { key: "Alt-ArrowUp", run: goToPreviousChunk },
          ]),
          // Show the current file with changes vs the committed base inline.
          unifiedMergeView({ original, mergeControls: false }),
          // Mark each changed chunk along the scrollbar.
          diffRuler,
          readoAppearance,
          langComp.of([]),
        ],
      }),
    });
    viewRef.current = view;
    setChunkCount(getChunks(view.state)?.chunks.length ?? 0);
    const desc = LanguageDescription.matchFilename(languages, path);
    if (desc) desc.load().then((s) => view.dispatch({ effects: langComp.reconfigure(s) }));
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = (next: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    (next ? goToNextChunk : goToPreviousChunk)(view);
    view.focus();
  };

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className="mx-auto h-full w-full [&_.cm-editor]:h-full"
        style={
          {
            "--code-font": codeFont || undefined,
          } as React.CSSProperties
        }
      />
      {chunkCount > 0 && (
        <div className="absolute top-3 right-4 z-10 flex items-center overflow-hidden rounded-md border border-line bg-overlay text-muted shadow-[var(--shadow)]">
          <button
            type="button"
            onClick={() => jump(false)}
            title={t("diff.prevChange")}
            aria-label={t("diff.prevChange")}
            className="grid h-7 w-7 place-items-center hover:bg-surface hover:text-ink"
          >
            <ChevronIcon className="h-3.5 w-3.5 -rotate-90" />
          </button>
          <span className="px-2 text-xs tabular-nums">
            {t("diff.changes", { count: chunkCount })}
          </span>
          <button
            type="button"
            onClick={() => jump(true)}
            title={t("diff.nextChange")}
            aria-label={t("diff.nextChange")}
            className="grid h-7 w-7 place-items-center hover:bg-surface hover:text-ink"
          >
            <ChevronIcon className="h-3.5 w-3.5 rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}
