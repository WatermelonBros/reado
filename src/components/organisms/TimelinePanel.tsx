/**
 * Timeline panel: how the active file got to its current shape.
 *
 * Two histories, because two different things happened to the file. **Local
 * history** is every save Reado made, independent of version control — the
 * answer to "I saved over the good version twenty minutes ago and the file was
 * never committed". **Git history** is the commits that touched it, following
 * renames. Selecting either diffs the current file against that version in the
 * existing read-only diff view; a local entry can also be restored, through the
 * same backed-up write everything else uses, so ⌘Z takes it back.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import {
  type FileCommit,
  gitFileHistory,
  type HistoryEntry,
  historyList,
  historyRead,
  writeBacked,
} from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { useFileUndo } from "@/lib/fileUndo"
import { notify, notifyError } from "@/lib/notice"
import { noteSelfWrite } from "@/lib/readProgress"
import { HISTORY_BASE, useEditorActions, useProject } from "@/lib/store"

const relAge = (seconds: number): string => {
  const days = (Date.now() / 1000 - seconds) / 86400
  if (days < 1) return "today"
  if (days < 30) return `${Math.floor(days)}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

/** A local entry's stamp is nanoseconds since the epoch, as a string. */
const stampMs = (stamp: string) => Number(stamp) / 1e6

/** "14:32" today, "3 Sep 14:32" before that — a save is a moment, not an era. */
function localWhen(stamp: string): string {
  const at = new Date(stampMs(stamp))
  const time = at.toTimeString().slice(0, 5)
  const today = new Date().toDateString() === at.toDateString()
  return today
    ? time
    : `${at.getDate()} ${at.toLocaleString(undefined, { month: "short" })} ${time}`
}

const ROW =
  "flex w-full flex-col gap-0.5 py-1.5 pr-3 pl-3 text-left transition-colors hover:bg-surface"

export function TimelinePanel() {
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const diffBase = useEditorActions((s) => s.diffBase)
  const diffing = useEditorActions((s) => s.diffing)
  const { t } = useTranslation()
  const [history, setHistory] = useState<FileCommit[]>([])
  const [local, setLocal] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Stamp armed for restore confirmation (inline, like the git panel's discard).
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  const rel = active ? toRelative(root, active) : null

  const reloadLocal = useCallback(() => {
    if (!rel) return
    historyList(root, rel)
      .then(setLocal)
      .catch(() => setLocal([]))
  }, [root, rel])

  // Reload when the active file changes.
  useEffect(() => {
    if (!active || !rel) {
      setHistory([])
      setLocal([])
      setFailed(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    reloadLocal()
    gitFileHistory(root, rel)
      .then((h) => !cancelled && setHistory(h))
      // A load failure must read differently from "no history for this file".
      .catch(() => {
        if (cancelled) return
        setHistory([])
        setFailed(true)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [root, active, rel, reloadLocal])

  if (!active) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("timeline.noFile")}</p>
  }

  const showCommit = (hash: string) => {
    useEditorActions.getState().setDiffBase(hash)
    useEditorActions.getState().setDiffing(true)
  }

  /** Put a parked copy back, through the backed-up write — so it is one ⌘Z. */
  const restore = async (stamp: string) => {
    setConfirmRestore(null)
    if (!rel) return
    try {
      const content = await historyRead(root, rel, stamp)
      noteSelfWrite(rel)
      const res = await writeBacked(root, rel, content)
      if (res.backups.length)
        useFileUndo.getState().record({ kind: "replace", backups: res.backups })
      notify("success", t("timeline.restored"))
      reloadLocal()
    } catch (e) {
      notifyError("timeline", t("timeline.restoreFailed"), e)
    }
  }

  const nothing = !loading && history.length === 0 && local.length === 0

  return (
    <div className="h-full overflow-y-auto py-1">
      {local.length > 0 && (
        <>
          <h3 className="px-3 py-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
            {t("timeline.local")}
          </h3>
          <ul className="m-0 list-none p-0">
            {local.map((entry) => {
              const isCurrent = diffing && diffBase === `${HISTORY_BASE}${entry.stamp}`
              return (
                <li key={entry.stamp} className="group/entry relative">
                  <button
                    type="button"
                    onClick={() => showCommit(`${HISTORY_BASE}${entry.stamp}`)}
                    className={`${ROW} ${isCurrent ? "bg-selection" : ""}`}
                  >
                    <span className="truncate text-xs text-ink">{localWhen(entry.stamp)}</span>
                    <span className="text-xs text-faint">{t("timeline.save")}</span>
                  </button>
                  {confirmRestore === entry.stamp ? (
                    <div className="absolute top-1 right-2">
                      <InlineConfirm
                        question={t("timeline.restoreAsk")}
                        confirmLabel={t("timeline.restore")}
                        onConfirm={() => void restore(entry.stamp)}
                        onCancel={() => setConfirmRestore(null)}
                      />
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRestore(entry.stamp)}
                      className="absolute top-1 right-2 opacity-0 transition-opacity group-hover/entry:opacity-100 focus-visible:opacity-100"
                    >
                      {t("timeline.restore")}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {history.length > 0 && (
        <>
          {local.length > 0 && (
            <h3 className="px-3 py-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
              {t("timeline.commits")}
            </h3>
          )}
          <ul className="m-0 list-none p-0">
            {history.map((c) => {
              const isCurrent = diffing && diffBase === c.hash
              return (
                <li key={c.hash}>
                  <button
                    type="button"
                    onClick={() => showCommit(c.hash)}
                    title={`${c.hash} · ${c.author}`}
                    className={`${ROW} ${isCurrent ? "bg-selection" : ""}`}
                  >
                    <span className="truncate text-xs text-ink">{c.subject || c.hash}</span>
                    <span className="flex items-center gap-2 text-xs text-faint">
                      <span className="truncate">{c.author}</span>
                      <span className="ml-auto flex-none font-mono tabular-nums">
                        {relAge(c.time)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {loading && <p className="px-3 py-2 text-xs text-faint">{t("common.loading")}</p>}
      {nothing && (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">
          {failed ? t("timeline.error") : t("timeline.empty")}
        </p>
      )}
    </div>
  )
}
