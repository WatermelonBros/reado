import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import type { Session, Verdict } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { useForge } from "@/lib/forge"
import { useGuidedReview } from "@/lib/guidedReview"
import { Confirm } from "./parts"

/** Footer: hand off to the resolve loop, summarise, close. */
export function SessionFooter({ root, session }: { root: string; session: Session }) {
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  const acceptedTasks = (session.proposals ?? []).filter(
    (p) => p.state === "converted_to_task" && p.commentId,
  )
  const memory = (session.proposals ?? []).filter(
    (p) => p.state === "discarded" || p.state === "resolved_as_false_positive",
  )
  return (
    <div className="mt-auto flex flex-none flex-col gap-2 border-t border-line px-4 py-3">
      {memory.length > 0 && (
        <p className="text-[10px] text-faint">{t("guided.memory", { count: memory.length })}</p>
      )}
      {session.scope.kind === "pr" ? (
        <PrSubmit root={root} session={session} />
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={acceptedTasks.length === 0}
          onClick={() => void store().sendTasks(root, session.id)}
        >
          {t("guided.sendTasks", { count: acceptedTasks.length })}
        </Button>
      )}
      <div className="flex items-center justify-between">
        {session.status !== "done" ? (
          <Button size="sm" onClick={() => void store().close(root, session.id)}>
            {t("guided.close")}
          </Button>
        ) : (
          <span />
        )}
        {/* The panel's most destructive control used to be its plainest: raw
              markup, ghost-quiet, one click from deleting the whole session. */}
        <Confirm
          danger
          confirmLabel={t("guided.resetConfirm")}
          title={t("guided.resetHint")}
          onConfirm={() => void store().discardSession(root, session.id)}
        >
          {t("guided.reset")}
        </Confirm>
      </div>
    </div>
  )
}

/** Submit a PR/MR session to the host as one batched review with a verdict. */
function PrSubmit({ root, session }: { root: string; session: Session }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()
  const number = Number((session.scope.pr ?? "").replace(/[^0-9]/g, "")) || 0
  // Without a real PR/MR number there's nothing to submit to (#0 would be wrong).
  const disabled = number === 0 || busy
  const allComments = useComments((s) => s.comments)

  // The review body is just the session summary; the per-line detail rides along
  // as inline comments.
  const body = session.summary ?? ""

  // Locally authored, line-anchored comments on the PR's files — the user's own
  // and accepted agent proposals. Pulled host threads (`externalId`) are excluded
  // so we never re-post what already exists on the PR.
  const comments = useMemo(() => {
    const routeFiles = new Set((session.route ?? []).map((e) => e.file))
    return allComments
      .filter((c) => !c.externalId && c.anchor.startLine > 0 && routeFiles.has(c.anchor.file))
      .map((c) => ({
        path: c.anchor.file,
        line: c.anchor.startLine,
        body: c.messages[0]?.body ?? "",
      }))
      .filter((c) => c.body.trim().length > 0)
  }, [allComments, session.route])

  const submit = async (verdict: Verdict) => {
    if (disabled) return
    setError(null)
    setBusy(true)
    const err = await useForge.getState().submit(root, number, verdict, body, comments)
    setBusy(false)
    if (err) setError(err)
    else setSent(true)
  }

  if (sent) return <p className="text-xs text-accent">{t("forge.submitted")}</p>

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{t("forge.submit")}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={disabled}
          className="bg-surface text-accent"
          onClick={() => void submit("approve")}
        >
          {t("forge.approve")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={disabled}
          className="bg-surface"
          onClick={() => void submit("request_changes")}
        >
          {t("forge.requestChanges")}
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => void submit("comment")}>
          {t("forge.comment")}
        </Button>
      </div>
      {number === 0 && <p className="text-[10px] leading-snug text-faint">{t("forge.noNumber")}</p>}
      {error && <p className="text-[10px] leading-snug text-marker">{error}</p>}
    </div>
  )
}
