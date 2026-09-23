import { useTranslation } from "react-i18next"
import { RouteIcon } from "@/components/atoms/icons"
import type { MessageKey } from "@/i18n"
import type { Session } from "@/lib/api"
import { currentEntry, useGuidedReview } from "@/lib/guidedReview"
import { FilePath, fileStateTone, SectionLabel } from "./parts"

/** The route, in order, each file with its state. */
export function RouteQueue({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session)
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  if (!session.route?.length) return null
  return (
    <section className="mt-6 flex-none border-t border-line/70 pt-4">
      <SectionLabel>
        <RouteIcon className="h-3 w-3" /> {t("guided.route")}
      </SectionLabel>
      <ul className="m-0 list-none p-0">
        {session.route.map((e) => {
          const fs = session.files?.find((f) => f.file === e.file)?.state ?? "queued"
          const isCurrent = e.file === entry?.file
          return (
            <li key={e.file}>
              <button
                type="button"
                onClick={() => void store().focusFile(root, session.id, e.file)}
                className={`group flex w-full items-center gap-2 border-l-2 py-2 pl-3.5 pr-4 text-left text-xs transition-colors ${
                  isCurrent
                    ? "border-accent bg-surface text-ink"
                    : "border-transparent text-muted hover:border-line-strong hover:bg-surface"
                }`}
                title={t("guided.openFile", { file: e.file })}
              >
                <FilePath file={e.file} />
                <span className={`flex-none text-[11px] ${fileStateTone(fs)}`}>
                  {t(`guided.fs.${fs}` as MessageKey)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
