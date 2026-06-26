/**
 * The resolve-loop status bar: shows a running batch's progress, flags when the
 * agent has gone quiet (needs approval), and lets the human cancel or dismiss.
 * Rendered inside the Review Guide panel; the same state reaches a paired phone
 * over the Reado Anywhere channel.
 */
import { useTranslation } from "react-i18next";
import { useProject } from "../../lib/store";
import { useResolveLoop } from "../../lib/resolveLoop";
import { SparkleIcon } from "../atoms/icons";

export function ResolveLoopBar() {
  const root = useProject((s) => s.root);
  const active = useResolveLoop((s) => s.active);
  const { t } = useTranslation();
  if (!active) return null;

  const resolved = active.resolvedIds.length;
  const total = active.ids.length;
  const pct = total ? (resolved / total) * 100 : 0;
  const done = active.status === "finished";
  const waiting = active.status === "needs_approval";

  const tone = done
    ? "text-accent"
    : waiting
      ? "text-marker"
      : "text-muted";

  return (
    <div className="flex-none border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <SparkleIcon
          className={`h-3 w-3 flex-none ${tone} ${active.status === "running" ? "animate-pulse" : ""}`}
        />
        <span className={`min-w-0 flex-1 truncate text-[11px] ${tone}`}>
          {done
            ? t("loop.finished")
            : waiting
              ? t("loop.needsApproval")
              : t("loop.running")}
        </span>
        <span className="flex-none text-[10px] tabular-nums text-faint">
          {t("loop.progress", { resolved, total })}
        </span>
        <button
          type="button"
          onClick={() => useResolveLoop.getState().clear(root)}
          className="flex-none rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink"
        >
          {done ? t("loop.dismiss") : t("loop.cancel")}
        </button>
      </div>
      <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-overlay">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${done ? "bg-accent" : waiting ? "bg-marker" : "bg-muted"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {waiting && <p className="mt-1 text-[10px] leading-snug text-faint">{t("loop.hint")}</p>}
    </div>
  );
}
