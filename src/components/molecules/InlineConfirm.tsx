/**
 * "Are you sure?" without leaving the row.
 *
 * A destructive action inside a dense list can't afford a modal: the row is
 * already carrying a filename, a status letter and a couple of hover actions.
 * So the confirmation replaces the row's controls in place — the question, the
 * answer named after what it does, and a quiet way out.
 *
 * It is a molecule rather than a Button variant because the *shape* is the
 * pattern: question, confirm, cancel, in that order. It was written out five
 * times across the app before this existed, in two different visual languages;
 * the buttons here are the shared atom so there is only one left.
 *
 * Layout belongs to the caller: pass `className` (`flex-col items-start` puts
 * the question on its own line, for a question too long to sit beside its
 * answers).
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { cn } from "@/lib/cn"

interface Props {
  /** The question, already phrased ("Discard?", "Drop this stash?"). */
  question: string
  /** The affirmative label — name the action, never "Yes". */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
  className?: string
}

export function InlineConfirm({
  question,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled,
  className,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className={cn("flex flex-none items-center gap-1.5 text-xs", className)}>
      <span className="text-muted">{question}</span>
      {/* Their own group, so a caller stacking the question keeps the two
        answers side by side rather than in a column. */}
      <span className="flex flex-none items-center gap-1.5">
        <Button variant="danger" size="sm" disabled={disabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </span>
    </div>
  )
}
