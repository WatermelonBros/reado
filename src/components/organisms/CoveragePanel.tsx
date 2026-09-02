/**
 * Reading coverage panel: a reading map of the project. Aggregates the
 * read-progress set against the file list into an overall percentage, a
 * per-top-level-folder breakdown, and a changed-since-read list. Read-only, live,
 * and cheap — all the work is the pure `computeCoverage`.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { listFiles } from "@/lib/api"
import { computeCoverage } from "@/lib/coverage"
import { createLogger, safeError } from "@/lib/logger"
import { useReadProgress } from "@/lib/readProgress"
import { useProject } from "@/lib/store"

const log = createLogger("coverage")

/** A progress bar that grows to its value on mount / when the value changes.
 *  Reduce-motion collapses the width transition to instant (global CSS rule). */
function Bar({ pct, className = "h-1.5" }: { pct: number; className?: string }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className={`w-full overflow-hidden rounded-full bg-line ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease,ease)]"
        style={{ width: `${grown ? pct : 0}%` }}
      />
    </div>
  )
}

export function CoveragePanel() {
  const root = useProject((s) => s.root)
  const treeNonce = useProject((s) => s.treeNonce)
  const open = useProject((s) => s.open)
  const read = useReadProgress((s) => s.read)
  const changed = useReadProgress((s) => s.changed)
  const { t } = useTranslation()

  const [files, setFiles] = useState<string[] | null>(null)

  useEffect(() => {
    if (!root) return
    let cancelled = false
    listFiles(root)
      .then((f) => !cancelled && setFiles(f))
      .catch((e) => {
        log.warn("list files failed", { error: safeError(e) })
        if (!cancelled) setFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [root, treeNonce])

  const cov = useMemo(
    () => (files ? computeCoverage(files, read, changed) : null),
    [files, read, changed],
  )

  if (!cov) {
    return <p className="px-4 py-6 text-xs text-faint">{t("common.loading")}</p>
  }
  if (cov.total === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("coverage.noFiles")}</p>
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Overall */}
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums text-ink">{cov.pct}%</span>
          <span className="text-xs tabular-nums text-muted">
            {cov.read}/{cov.total} {t("coverage.filesRead")}
          </span>
        </div>
        <div className="mt-2">
          <Bar pct={cov.pct} />
        </div>
        {cov.read === 0 && (
          <p className="mt-3 text-xs leading-relaxed text-faint">{t("coverage.empty")}</p>
        )}
      </div>

      {/* Changed since read */}
      {cov.changed.length > 0 && (
        <div className="border-b border-line py-2">
          <div className="px-3 pt-1 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
            {t("coverage.changed")}
          </div>
          {cov.changed.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => open(`${root}/${path}`)}
              title={path}
              className="flex w-full min-w-0 items-center gap-2 py-1 pr-3 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-marker" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
            </button>
          ))}
        </div>
      )}

      {/* Per-folder breakdown */}
      <ul className="m-0 list-none p-0 py-1">
        {cov.folders.map((f) => {
          const pct = f.total === 0 ? 0 : Math.round((f.read / f.total) * 100)
          return (
            <li key={f.path || "root"} className="px-3 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {f.path || t("coverage.rootBucket")}
                </span>
                <span className="flex-none text-xs tabular-nums text-faint">
                  {f.read}/{f.total}
                </span>
              </div>
              <div className="mt-1">
                <Bar pct={pct} className="h-1" />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
