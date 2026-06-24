/**
 * Agent activity panel: external file changes this session — mostly the terminal
 * AI agent resolving your comments. Read-only and honest: it reports what changed
 * and how many comments sit on each file, click to open. It never drives the agent.
 */
import { useActivity } from "../../lib/activity";
import { useProject } from "../../lib/store";
import { useComments, commentsForFile } from "../../lib/comments";
import { useReadProgress, LAST_READ_BASE } from "../../lib/readProgress";
import { useEditorActions } from "../../lib/store";
import { useTranslation } from "react-i18next";

const relAge = (ms: number): string => {
  const secs = (Date.now() - ms) / 1000;
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
};

export function ActivityPanel() {
  const entries = useActivity((s) => s.entries);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const comments = useComments((s) => s.comments);
  const changed = useReadProgress((s) => s.changed);
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("activity.empty")}</p>;
  }

  // Open the file; if it has a pending delta (it changed since you read it), open
  // the delta review so you see exactly what the agent did.
  const openEntry = (file: string) => {
    open(`${root}/${file}`);
    if (changed.has(file)) {
      useEditorActions.getState().setDiffBase(LAST_READ_BASE);
      useEditorActions.getState().setDiffing(true);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
          {t("activity.recent")}
        </span>
        <button
          type="button"
          onClick={() => useActivity.getState().clear()}
          className="text-[11px] text-faint hover:text-ink"
        >
          {t("activity.clear")}
        </button>
      </div>
      <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
        {entries.map((e) => {
          const count = commentsForFile(comments, e.file).length;
          return (
            <li key={e.file}>
              <button
                type="button"
                onClick={() => openEntry(e.file)}
                title={e.file}
                className="flex w-full items-center gap-2 py-1 pr-3 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                {changed.has(e.file) && (
                  <span className="flex-none text-[11px] font-semibold text-accent">Δ</span>
                )}
                <span className="min-w-0 flex-1 truncate">{e.file}</span>
                {count > 0 && (
                  <span className="flex-none text-[11px] text-faint tabular-nums">
                    {t("activity.comments", { count })}
                  </span>
                )}
                <span className="flex-none font-mono text-[11px] text-faint tabular-nums">
                  {relAge(e.time)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
