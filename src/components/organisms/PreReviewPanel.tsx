/**
 * AI pre-review panel: the agent's proposed DRAFT review comments for the current
 * changes. The human approves each (→ a real anchored comment) or discards it.
 * Never edits code, never posts directly.
 */
import { usePreReview } from "../../lib/preReview";
import { useProject } from "../../lib/store";
import { SparkleIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function PreReviewPanel() {
  const drafts = usePreReview((s) => s.drafts);
  const generating = usePreReview((s) => s.generating);
  const error = usePreReview((s) => s.error);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center justify-between border-b border-line px-2 py-1.5">
        <button
          type="button"
          onClick={() => usePreReview.getState().generate(root)}
          disabled={generating}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          <SparkleIcon className="h-3 w-3" />
          {generating ? t("prereview.generating") : t("prereview.run")}
        </button>
      </div>

      {drafts.length === 0 && error ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("prereview.error")}</p>
      ) : drafts.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("prereview.empty")}</p>
      ) : (
        <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
          {drafts.map((d) => (
            <li key={d.id} className="border-b border-line/60 px-3 py-2">
              <button
                type="button"
                onClick={() => open(`${root}/${d.file}`, d.line)}
                title={`${d.file}:${d.line}`}
                className="block w-full text-left"
              >
                <div className="flex items-center gap-2 text-xs text-faint">
                  <span className="rounded bg-surface px-1.5 py-0.5 text-muted">{d.type}</span>
                  <span className="min-w-0 flex-1 truncate">{d.file}</span>
                  <span className="flex-none tabular-nums">{d.line}</span>
                </div>
                <p className="mt-1 text-xs text-ink">{d.body}</p>
              </button>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void usePreReview.getState().approve(root, d.id)}
                  className="rounded-md bg-surface px-2 py-0.5 text-xs text-accent hover:text-ink"
                >
                  {t("prereview.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => usePreReview.getState().discard(root, d.id)}
                  className="rounded-md px-2 py-0.5 text-xs text-faint hover:text-ink"
                >
                  {t("prereview.discard")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
