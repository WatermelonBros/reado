import { useTranslation } from "react-i18next"
import { WarningIcon } from "@/components/atoms/icons"
import type { Session } from "@/lib/api"
import { useGuidedReview } from "@/lib/guidedReview"
import { Action, FilePath, SectionLabel, UNCOVERED_SHOWN } from "./parts"

/** Files the scope contains that the route never picked up. */
export function UncoveredFiles({
  root,
  session,
  uncovered,
  gapRef,
}: {
  root: string
  session: Session
  uncovered: string[]
  gapRef: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  if (uncovered.length === 0) return null
  return (
    <section ref={gapRef} className="mt-5 flex-none">
      <SectionLabel>
        <WarningIcon className="h-3 w-3 flex-none text-marker" />
        <span className="text-marker">{t("guided.uncovered", { count: uncovered.length })}</span>
      </SectionLabel>
      <ul className="m-0 list-none p-0">
        {/* A 40-file diff against a 6-file route would otherwise render 34
                rows under the queue. The count is in the heading; the list only
                has to show enough to act on. */}
        {uncovered.slice(0, UNCOVERED_SHOWN).map((f) => (
          <li key={f}>
            <button
              type="button"
              onClick={() => void store().focusFile(root, session.id, f)}
              className="flex w-full items-center gap-2 py-2 pl-4 pr-4 text-left text-xs text-muted hover:bg-surface hover:text-ink"
              title={t("guided.openFile", { file: f })}
            >
              <FilePath file={f} />
            </button>
          </li>
        ))}
      </ul>
      {uncovered.length > UNCOVERED_SHOWN && (
        <p className="px-4 pt-1 text-[11px] text-faint">
          {t("guided.uncoveredMore", { count: uncovered.length - UNCOVERED_SHOWN })}
        </p>
      )}
      <div className="px-4 pb-4 pt-3">
        <Action
          tone="accent"
          title={t("guided.uncoveredAskHint")}
          onClick={() => void store().cover(root, session.id, uncovered)}
        >
          {t("guided.uncoveredAsk")}
        </Action>
      </div>
    </section>
  )
}
