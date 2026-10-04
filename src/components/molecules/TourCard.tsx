/**
 * The card an Ark UI tour step shows: title, description, "3 of 12", the step's
 * actions and a close. Shared by the app's first-run tour and project tours.
 */
import { Tour } from "@ark-ui/react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { CloseIcon } from "@/components/atoms/icons"
import { cn } from "@/lib/cn"

/** "3 of 12", in the app's language, for `useTour({ translations })`. */
export const tourTranslations = (t: TFunction) => ({
  progressText: ({ current, total }: { current: number; total: number }) =>
    t("projectTour.progress", { current: current + 1, total }),
})

export function TourCard({
  className,
  titleClassName = "text-base",
}: {
  className?: string
  titleClassName?: string
}) {
  const { t } = useTranslation()
  return (
    <Tour.Positioner>
      <Tour.Content
        className={cn(
          "relative z-[302] flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-line-strong bg-overlay p-4 text-sm shadow-[var(--shadow),0_2px_10px_oklch(0_0_0/0.35)]",
          className,
        )}
      >
        <Tour.Title className={cn("pr-6 font-semibold text-ink", titleClassName)} />
        <Tour.Description className="leading-relaxed text-muted" />
        <div className="mt-1 flex items-center justify-between gap-3">
          <Tour.ProgressText className="text-xs tabular-nums text-faint" />
          <Tour.Actions>
            {(actions) => (
              <div className="flex gap-1.5">
                {actions.map((a) => (
                  <Tour.ActionTrigger
                    key={a.label}
                    action={a}
                    className="rounded-md border border-line px-2.5 py-1 text-xs text-ink transition-colors hover:border-accent hover:bg-surface focus-visible:outline-1 focus-visible:outline-accent"
                  >
                    {a.label}
                  </Tour.ActionTrigger>
                ))}
              </div>
            )}
          </Tour.Actions>
        </div>
        <Tour.CloseTrigger
          aria-label={t("projectTour.close")}
          className="absolute top-2.5 right-2.5 grid h-5 w-5 place-items-center rounded text-faint hover:text-ink"
        >
          <CloseIcon className="h-3 w-3" />
        </Tour.CloseTrigger>
      </Tour.Content>
    </Tour.Positioner>
  )
}
