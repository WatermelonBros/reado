import { useTranslation } from "react-i18next"
import { RouteIcon } from "@/components/atoms/icons"
import type { Session } from "@/lib/api"
import { useGuidedReview } from "@/lib/guidedReview"
import { Action, Confirm } from "./parts"

/** A route change the agent proposed, with what accepting it would add and drop. */
export function RouteChangeCard({ root, session }: { root: string; session: Session }) {
  const change = session.routeChange
  const { t } = useTranslation()
  const store = useGuidedReview.getState

  /** How much work a file already carries — every proposal ever made on it. It
   *  is the price of dropping that file from the route. */
  const findingsOn = (file: string) =>
    (session.proposals ?? []).filter((p) => p.file === file).length
  const routeFiles = (session.route ?? []).map((e) => e.file)
  const proposedFiles = new Set((change?.route ?? []).map((e) => e.file))
  const added = (change?.route ?? []).filter((e) => !routeFiles.includes(e.file)).map((e) => e.file)
  const dropped = change ? routeFiles.filter((f) => !proposedFiles.has(f)) : []
  const droppedFindings = dropped.reduce((n, f) => n + findingsOn(f), 0)
  if (!change) return null
  return (
    <section className="flex-none px-4 pt-3">
      <div className="animate-rise rounded-lg border border-accent/40 bg-accent/5 p-3">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent">
          <RouteIcon className="h-3 w-3" /> {t("guided.routeChange")}
        </p>
        <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-ink">
          {change.reason}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
          {t("guided.routeChangeShape", {
            from: routeFiles.length,
            to: change.route.length,
          })}
          {added.length > 0 && (
            <>
              {" — "}
              {t("guided.routeChangeAdds")}: {added.join(", ")}
            </>
          )}
          {dropped.length > 0 && (
            <>
              {" — "}
              <span className="text-marker">
                {t("guided.routeChangeDrops")}:{" "}
                {dropped
                  .map((f) => {
                    // A filename is not enough to weigh the loss: what it
                    // costs is the work already done on that file, so that
                    // is what the line says.
                    const n = findingsOn(f)
                    return n > 0 ? `${f} (${t("guided.findings", { count: n })})` : f
                  })
                  .join(", ")}
              </span>
            </>
          )}
        </p>
        {/* What the box *is*, in Reado's own voice, directly above the two
                buttons it qualifies — which is where the question is asked. The
                agent's reason says what it wants; nothing said what a route is,
                or what pressing either button would do. */}
        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          {t("guided.routeChangeExplain")}
        </p>
        <div className="mt-2 flex items-stretch gap-1.5">
          <Confirm
            // Only a change that throws work away needs a second press; a
            // pure addition costs the reviewer nothing.
            guarded={droppedFindings > 0}
            tone={droppedFindings > 0 ? "muted" : "accent"}
            confirmLabel={t("guided.routeChangeConfirm", { count: droppedFindings })}
            onConfirm={() => void store().acceptRouteChange(root, session.id)}
          >
            {t("guided.routeChangeAccept")}
          </Confirm>
          <Action onClick={() => void store().discardRouteChange(root, session.id)}>
            {t("guided.routeChangeDiscard")}
          </Action>
        </div>
      </div>
    </section>
  )
}
