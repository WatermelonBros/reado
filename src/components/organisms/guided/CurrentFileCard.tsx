import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { MoreIcon } from "@/components/atoms/icons"
import type { Session } from "@/lib/api"
import { currentEntry, useGuidedReview } from "@/lib/guidedReview"
import { Action, MENU_TRIGGER } from "./parts"

/** The file the review is on, and the moves that advance it. */
export function CurrentFileCard({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session)
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  // The current file already has findings → a "second opinion" makes sense (it
  // challenges those, which is what distinguishes it from the first review).
  const reviewedCurrent = !!entry && (session.proposals ?? []).some((p) => p.file === entry.file)
  if (!entry) return null
  return (
    <section key={entry.file} className="animate-rise flex-none px-4 pb-1 pt-5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {t("guided.current")}
      </h3>
      <button
        type="button"
        onClick={() => void store().focusFile(root, session.id, entry.file)}
        className="mt-1.5 block w-full truncate text-left text-[15px] font-semibold leading-tight text-ink hover:text-accent"
        title={entry.file}
        // Finishing a file moves the cursor, this block and the editor at
        // once. Sighted users see all three; this is the only one a screen
        // reader would otherwise have to be told about by hand.
        aria-live="polite"
      >
        {entry.file.split("/").pop()}
      </button>
      {entry.reason && (
        <p className="mt-1.5 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
          {entry.reason}
        </p>
      )}
      {!!entry.relatedFiles?.length && (
        <p className="mt-1 truncate text-[11px] text-faint" title={entry.relatedFiles.join(", ")}>
          {t("guided.related")}: {entry.relatedFiles.join(", ")}
        </p>
      )}
      {/* Primary CTA: first press reviews the file; once it has findings a
              second press runs a second-opinion pass that challenges them. */}
      <Button
        variant="primary"
        className="mt-4 h-9 w-full"
        title={reviewedCurrent ? t("guided.action.againHint") : t("guided.action.reviewHint")}
        onClick={() => {
          if (reviewedCurrent) void store().challenge(root, session.id, entry.file)
          else void store().reviewFile(root, session.id, entry.file)
        }}
      >
        {reviewedCurrent ? t("guided.action.again") : t("guided.action.review")}
      </Button>
      {/* Two chips, not four: marking the file done and skipping it are the
              moves that advance the review. Responding to comments and the wide
              pass are occasional, and each one added to this row cost the two
              that matter their prominence. */}
      <div className="mt-2 flex items-stretch gap-1.5">
        <Action
          fill
          onClick={() => void store().finishFile(root, session.id, entry.file, "reviewed")}
        >
          {t("guided.action.reviewed")}
        </Action>
        <Action
          fill
          onClick={() => void store().finishFile(root, session.id, entry.file, "skipped")}
        >
          {t("guided.action.skip")}
        </Action>
        <Dropdown
          label={t("guided.moreActions")}
          placement="bottom"
          align="end"
          triggerClassName={MENU_TRIGGER}
          trigger={<MoreIcon className="h-3.5 w-3.5" />}
        >
          <MenuRow
            label={t("guided.action.respond")}
            onClick={() => void store().respond(root, session.id, entry.file)}
          />
          {/* Deliberately user-triggered: the wide pass is expensive, and it
                  only earns its keep once the narrow walk has found its share. */}
          <MenuRow
            label={t("guided.action.widen")}
            onClick={() => void store().widen(root, session.id)}
          />
        </Dropdown>
      </div>
    </section>
  )
}
