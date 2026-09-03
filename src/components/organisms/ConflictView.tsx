/**
 * Conflict resolution: one decision per conflicted region.
 *
 * A merge conflict is a question ("which of these two do you want?"), and the
 * markers in the file are a hostile way to ask it. This shows each region as
 * both sides side by side, labelled with the branch each came from, and takes
 * one answer: ours, theirs, or both. Resolving rewrites that region and leaves
 * the rest alone, so a file with five conflicts is five small decisions rather
 * than one edit of a marker-riddled file.
 *
 * The escape hatch is deliberate and separate: "Abort" abandons the whole merge
 * or rebase, is styled as destructive, and asks first.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import {
  type ConflictRegion,
  gitConflictRegions,
  gitMergeAbort,
  gitRebaseAbort,
  gitResolveConflict,
  gitStage,
} from "@/lib/api"
import { notifyError } from "@/lib/notice"
import { useProject } from "@/lib/store"

/** One side of a region: its label, and the lines it wants. */
function Side({
  label,
  text,
  onKeep,
  keepLabel,
}: {
  label: string
  text: string
  onKeep: () => void
  keepLabel: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] text-faint">{label}</span>
        <Button size="sm" onClick={onKeep}>
          {keepLabel}
        </Button>
      </div>
      <pre className="m-0 max-h-48 overflow-auto rounded-md border border-line bg-canvas p-2 font-mono text-xs leading-relaxed text-ink">
        {text || " "}
      </pre>
    </div>
  )
}

export function ConflictView({ relPath }: { relPath: string }) {
  const root = useProject((s) => s.root)
  const { t } = useTranslation()
  const [regions, setRegions] = useState<ConflictRegion[] | null>(null)
  const [confirmingAbort, setConfirmingAbort] = useState(false)

  const load = useCallback(() => {
    gitConflictRegions(root, relPath)
      .then(setRegions)
      .catch(() => setRegions([]))
  }, [root, relPath])

  useEffect(load, [load])

  const resolve = async (index: number, side: "ours" | "theirs" | "both") => {
    try {
      await gitResolveConflict(root, relPath, index, side)
      load()
    } catch (e) {
      notifyError("conflict", t("conflict.resolveFailed"), e)
    }
  }

  const markResolved = async () => {
    try {
      // Staging is what tells git the conflict is settled — the same thing
      // `git add` does after you edit the markers out by hand.
      await gitStage(root, relPath)
      load()
    } catch (e) {
      notifyError("conflict", t("conflict.markFailed"), e)
    }
  }

  const abort = async () => {
    try {
      // A rebase and a merge are aborted by different commands and only one is
      // in progress, so try the merge and fall back rather than asking the user
      // which kind of operation they are in.
      await gitMergeAbort(root).catch(() => gitRebaseAbort(root))
      load()
    } catch (e) {
      notifyError("conflict", t("conflict.abortFailed"), e)
    } finally {
      setConfirmingAbort(false)
    }
  }

  if (regions === null) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">{t("common.loading")}</div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {regions.length === 0
            ? t("conflict.allResolved")
            : t("conflict.remaining", { count: regions.length })}
        </span>
        {regions.length === 0 && (
          <Button variant="primary" size="sm" onClick={() => void markResolved()}>
            {t("conflict.markResolved")}
          </Button>
        )}
        {confirmingAbort ? (
          <>
            <Button variant="danger" size="sm" onClick={() => void abort()}>
              {t("conflict.abortConfirm")}
            </Button>
            <Button size="sm" onClick={() => setConfirmingAbort(false)}>
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirmingAbort(true)}>
            {t("conflict.abort")}
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {regions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm leading-relaxed text-faint">
            {t("conflict.allResolvedHint")}
          </p>
        ) : (
          regions.map((r) => (
            <section
              key={`${r.startLine}-${r.endLine}`}
              className="border-b border-line px-4 py-3 last:border-b-0"
            >
              <p className="mb-2 font-mono text-[10px] text-faint">
                {t("conflict.lines", { from: r.startLine, to: r.endLine })}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Side
                  label={r.oursLabel || t("conflict.ours")}
                  text={r.ours}
                  keepLabel={t("conflict.keepOurs")}
                  onKeep={() => void resolve(r.index, "ours")}
                />
                <Side
                  label={r.theirsLabel || t("conflict.theirs")}
                  text={r.theirs}
                  keepLabel={t("conflict.keepTheirs")}
                  onKeep={() => void resolve(r.index, "theirs")}
                />
              </div>
              <Button size="sm" className="mt-2" onClick={() => void resolve(r.index, "both")}>
                {t("conflict.keepBoth")}
              </Button>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
