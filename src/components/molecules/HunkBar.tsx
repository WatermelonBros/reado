/**
 * Per-hunk staging, beside the diff.
 *
 * Staging a whole file is the wrong granularity for review: a working tree
 * usually holds one change worth committing and three that aren't. Each hunk
 * here can be staged, unstaged or discarded on its own — the same thing
 * `git add -p` does, without the interactive prompt and without leaving the
 * reader.
 *
 * Discard is the one irreversible action in the strip (the change isn't in git
 * yet, so nothing can bring it back), so it asks first and is styled as
 * destructive.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { gitApplyPatch, gitFileHunks, type Hunk } from "@/lib/api"
import { notifyError } from "@/lib/notice"
import { useProject } from "@/lib/store"

interface Props {
  relPath: string
  /** Called after a hunk moves, so the diff around it can refresh. */
  onChanged?: () => void
}

export function HunkBar({ relPath, onChanged }: Props) {
  const root = useProject((s) => s.root)
  const { t } = useTranslation()
  const [unstaged, setUnstaged] = useState<Hunk[]>([])
  const [staged, setStaged] = useState<Hunk[]>([])
  const [confirming, setConfirming] = useState<number | null>(null)
  /** The hunk currently broken out into its individual lines, if any. */
  const [expanded, setExpanded] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    Promise.all([gitFileHunks(root, relPath, false), gitFileHunks(root, relPath, true)])
      .then(([working, index]) => {
        setUnstaged(working)
        setStaged(index)
      })
      .catch(() => {
        setUnstaged([])
        setStaged([])
      })
  }, [root, relPath])

  useEffect(load, [load])

  /** Apply a hunk's patch, then re-read: a hunk's identity is its position in
   *  the diff, and moving one renumbers the rest. */
  const applyPatch = async (patch: string, cached: boolean, reverse: boolean, failed: string) => {
    setBusy(true)
    try {
      await gitApplyPatch(root, patch, cached, reverse)
      load()
      onChanged?.()
    } catch (e) {
      notifyError("hunk", failed, e)
    } finally {
      setBusy(false)
      setConfirming(null)
      setExpanded(null)
    }
  }
  const apply = (hunk: Hunk, cached: boolean, reverse: boolean, failed: string) =>
    applyPatch(hunk.patch, cached, reverse, failed)

  if (unstaged.length === 0 && staged.length === 0) return null

  const count = (h: Hunk) => `+${h.added} −${h.removed}`

  return (
    <div className="flex max-h-40 flex-none flex-col overflow-y-auto border-b border-line bg-surface">
      {unstaged.map((h) => (
        <div key={`w${h.index}`}>
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-faint" title={h.header}>
              {t("hunk.at", { line: h.newStart })} · {count(h)}
            </span>
            {h.linePatches.length > 0 && confirming !== h.index && (
              <Button size="sm" onClick={() => setExpanded(expanded === h.index ? null : h.index)}>
                {expanded === h.index ? t("hunk.collapseLines") : t("hunk.byLine")}
              </Button>
            )}
            {confirming === h.index ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => void apply(h, false, true, t("hunk.discardFailed"))}
                >
                  {t("hunk.discardConfirm")}
                </Button>
                <Button size="sm" onClick={() => setConfirming(null)}>
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void apply(h, true, false, t("hunk.stageFailed"))}
                >
                  {t("hunk.stage")}
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirming(h.index)}>
                  {t("hunk.discard")}
                </Button>
              </>
            )}
          </div>
          {/* Line-level staging, only where it is unambiguous: a hunk that adds
          without removing. Elsewhere a single line isn't a patch anyone means. */}
          {expanded === h.index &&
            h.linePatches.map((l) => (
              <div key={l.line} className="flex items-center gap-2 py-1 pr-3 pl-8 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono text-faint" title={l.text}>
                  {l.line} · {l.text.trim() || " "}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void applyPatch(l.patch, true, false, t("hunk.stageFailed"))}
                >
                  {t("hunk.stageLine")}
                </Button>
              </div>
            ))}
        </div>
      ))}
      {staged.map((h) => (
        <div
          key={`s${h.index}`}
          className="flex items-center gap-2 border-t border-line/60 px-3 py-1.5 text-xs"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-accent" title={h.header}>
            {t("hunk.staged")} · {t("hunk.at", { line: h.newStart })} · {count(h)}
          </span>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void apply(h, true, true, t("hunk.unstageFailed"))}
          >
            {t("hunk.unstage")}
          </Button>
        </div>
      ))}
    </div>
  )
}
