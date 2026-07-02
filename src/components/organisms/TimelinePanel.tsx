/**
 * Timeline panel: the git history of the active file (commits that touched it),
 * following renames. Click an entry to diff the current file against that commit
 * (reuses the diff view via the diff base). Read-first: understand how a file
 * got to its current shape. Read-only.
 */
import { useEffect, useState } from "react";
import { gitFileHistory, type FileCommit } from "../../lib/api";
import { useProject, useEditorActions } from "../../lib/store";
import { toRelative } from "../../lib/comments";
import { useTranslation } from "react-i18next";

const relAge = (seconds: number): string => {
  const days = (Date.now() / 1000 - seconds) / 86400;
  if (days < 1) return "today";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
};

export function TimelinePanel() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const diffBase = useEditorActions((s) => s.diffBase);
  const diffing = useEditorActions((s) => s.diffing);
  const { t } = useTranslation();
  const [history, setHistory] = useState<FileCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reload when the active file changes.
  useEffect(() => {
    if (!active) {
      setHistory([]);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    gitFileHistory(root, toRelative(root, active))
      .then((h) => !cancelled && setHistory(h))
      // A load failure must read differently from "no history for this file".
      .catch(() => {
        if (cancelled) return;
        setHistory([]);
        setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [root, active]);

  if (!active) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("timeline.noFile")}</p>;
  }
  if (!loading && failed) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("timeline.error")}</p>;
  }
  if (!loading && history.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("timeline.empty")}</p>;
  }

  const showCommit = (hash: string) => {
    useEditorActions.getState().setDiffBase(hash);
    useEditorActions.getState().setDiffing(true);
  };

  return (
    <ul className="m-0 h-full list-none overflow-y-auto p-0 py-1">
      {loading && <li className="px-3 py-2 text-xs text-faint">{t("common.loading")}</li>}
      {history.map((c) => {
        const isCurrent = diffing && diffBase === c.hash;
        return (
          <li key={c.hash}>
            <button
              type="button"
              onClick={() => showCommit(c.hash)}
              title={`${c.hash} · ${c.author}`}
              className={`flex w-full flex-col gap-0.5 py-1.5 pr-3 pl-3 text-left transition-colors ${
                isCurrent ? "bg-selection" : "hover:bg-surface"
              }`}
            >
              <span className="truncate text-xs text-ink">{c.subject || c.hash}</span>
              <span className="flex items-center gap-2 text-xs text-faint">
                <span className="truncate">{c.author}</span>
                <span className="ml-auto flex-none font-mono tabular-nums">{relAge(c.time)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
