import { useTranslation } from "react-i18next"
import type { MessageKey } from "@/i18n"
import type { Session } from "@/lib/api"
import { progress } from "@/lib/guidedReview"

/** Progress through the route, the session's objective, and the scope the route left out. */
export function SessionProgress({
  session,
  uncovered,
  gapRef,
}: {
  session: Session
  uncovered: string[]
  gapRef: React.RefObject<HTMLDivElement | null>
}) {
  const { reviewed, total } = progress(session)
  const { t } = useTranslation()
  // One sentence naming every number the two bars stand for: an 8px bar cannot
  // carry its own legend.
  const barTitle = uncovered.length
    ? `${t("guided.progress", { reviewed, total })} · ${t("guided.outside", { count: uncovered.length })}`
    : t("guided.progress", { reviewed, total })
  return (
    <div className="flex-none px-4 pt-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 text-muted tabular-nums">
          {t("guided.progress", { reviewed, total })}
          {/* Progress counts the route, and the route can be smaller than the
                change. Without this, a review that never looked at a third of
                the diff still reads "done" — so the gap is named here, in the
                same words the section below uses, and clicking goes to it. */}
          {uncovered.length > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => gapRef.current?.scrollIntoView({ block: "nearest" })}
                className="text-marker underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {t("guided.outside", { count: uncovered.length })}
              </button>
            </>
          )}
        </span>
        {session.objective && (
          <span className="flex-none rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
            {t(`guided.obj.${session.objective}` as MessageKey)}
          </span>
        )}
      </div>
      {/* Two bars, not one with a mystery segment on its end: the plan, and —
            only when there is one — what the plan never included. A single
            stacked bar made the uncovered share look like progress of some kind,
            when it is the opposite: work that is not even scheduled. The gap
            between them is what says "these are different things".

            The track needs its own boundary too — it was `bg-surface` drawn on a
            `bg-surface` parent, which painted nothing at all at 0%. */}
      <div className="mt-2 flex items-center gap-1" title={barTitle}>
        <div
          className="flex h-2 overflow-hidden rounded-full border border-line bg-bg"
          style={{ flexGrow: total || 1 }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={reviewed}
          aria-label={t("guided.progress", { reviewed, total })}
        >
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: total ? `${(reviewed / total) * 100}%` : "0%" }}
          />
        </div>
        {uncovered.length > 0 && (
          // Decorative, deliberately: the line above already says "2 outside
          // the route" in words, in this colour, and clicking it goes to the
          // list. A second control with the same name would be a duplicate
          // tab stop that adds nothing.
          <div
            aria-hidden="true"
            data-testid="uncovered-bar"
            className="h-2 flex-none rounded-full border border-marker/40 bg-[repeating-linear-gradient(135deg,var(--color-marker)_0_2px,transparent_2px_5px)] opacity-70"
            style={{ flexGrow: uncovered.length, flexBasis: 0 }}
          />
        )}
      </div>
    </div>
  )
}
