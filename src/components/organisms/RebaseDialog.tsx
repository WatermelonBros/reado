/**
 * Interactive rebase: the plan, as a list you can edit, instead of a todo file
 * in an editor git spawned.
 *
 * `git rebase -i` is two things in a trench coat — a plan, and a text editor to
 * write it in. Reado only needs the first: the commits are listed oldest first
 * (the order git replays them, and the order the todo file uses), each one
 * carries what to do with it, and the arrows move a commit within the plan. The
 * file git would have opened is written from this, so nothing here can produce a
 * todo git would refuse.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { ArrowDownIcon, ArrowUpIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { Select } from "@/components/atoms/Select"
import type { MessageKey } from "@/i18n"
import { gitRebaseCommits, gitRebaseInteractive, gitStatus, type RebaseAction } from "@/lib/api"
import { notify, notifyError } from "@/lib/notice"
import { useProject } from "@/lib/store"

interface Line {
  hash: string
  subject: string
  action: RebaseAction
}

// No `reword`: it is the one action that needs an editor per commit, and
// rewording the last commit is what Amend already is. Squash keeps git's own
// combined message.
const ACTIONS: RebaseAction[] = ["pick", "squash", "fixup", "drop"]
const ACTION_LABEL: Record<RebaseAction, MessageKey> = {
  pick: "git.todo.pick",
  squash: "git.todo.squash",
  fixup: "git.todo.fixup",
  drop: "git.todo.drop",
}

export function RebaseDialog({
  upstream,
  onClose,
  onDone,
}: {
  /** The branch to replay onto — commits after it are the ones being planned. */
  upstream: string
  onClose: () => void
  onDone: () => void
}) {
  const root = useProject((s) => s.root)
  const { t } = useTranslation()
  const [lines, setLines] = useState<Line[] | null>(null)
  const [busy, setBusy] = useState(false)
  /** Tracked edits in the working tree. Git refuses to rebase over them, and
   *  saying so here beats a button that looks ready and then fails. Untracked
   *  files are fine — a rebase does not touch them. */
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    gitRebaseCommits(root, upstream)
      .then((cs) => setLines(cs.map((c) => ({ ...c, action: "pick" as const }))))
      .catch(() => setLines([]))
  }, [root, upstream])

  useEffect(() => {
    gitStatus(root)
      .then((changes) => setDirty(changes.some((c) => c.status !== "untracked")))
      .catch(() => setDirty(false))
  }, [root])

  const move = (i: number, by: number) =>
    setLines((prev) => {
      if (!prev) return prev
      const j = i + by
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const setAction = (i: number, action: RebaseAction) =>
    setLines((prev) => prev?.map((l, k) => (k === i ? { ...l, action } : l)) ?? prev)

  const run = async () => {
    if (!lines?.length) return
    setBusy(true)
    try {
      const out = await gitRebaseInteractive(
        root,
        upstream,
        lines.map(({ action, hash }) => ({ action, hash })),
      )
      if (out.conflicted.length)
        notify(
          "info",
          t("git.applyConflicted", {
            count: out.conflicted.length,
            files: out.conflicted.join(", "),
          }),
        )
      else notify("success", t("git.rebased", { branch: upstream }))
      onDone()
      onClose()
    } catch (e) {
      notifyError("rebase", t("git.rebaseFailed", { branch: upstream }), e)
    } finally {
      setBusy(false)
    }
  }

  // A plan that squashes into nothing is the one git rejects outright; saying so
  // here beats letting it start and stop.
  const firstFolds =
    !!lines?.length && (lines[0].action === "squash" || lines[0].action === "fixup")
  const allDropped = !!lines?.length && lines.every((l) => l.action === "drop")

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      ariaLabel={t("git.rebaseInteractive")}
      className="flex max-h-[80vh] w-[min(680px,94vw)] flex-col p-4"
    >
      <h2 className="text-sm font-medium text-ink">{t("git.rebaseInteractive")}</h2>
      <p className="mt-1 mb-3 text-xs text-muted">{t("git.rebasePlan", { branch: upstream })}</p>

      {lines === null ? (
        <p className="py-6 text-center text-xs text-faint">{t("common.loading")}</p>
      ) : lines.length === 0 ? (
        <p className="py-6 text-center text-xs text-faint">{t("git.rebaseNothing")}</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {lines.map((l, i) => (
            <li
              key={l.hash}
              className={`flex items-center gap-2 rounded-md border border-line px-2 py-1 ${
                l.action === "drop" ? "opacity-50" : ""
              }`}
            >
              <Select
                value={l.action}
                options={ACTIONS.map((a) => ({ value: a, label: t(ACTION_LABEL[a]) }))}
                onChange={(a) => setAction(i, a)}
                variant="ghost"
                ariaLabel={t("git.rebaseAction")}
                className="w-28 flex-none"
              />
              <span className="flex-none font-mono text-[10px] text-faint">
                {l.hash.slice(0, 7)}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-sm text-ink ${
                  l.action === "drop" ? "line-through" : ""
                }`}
              >
                {l.subject}
              </span>
              <IconButton
                label={t("git.rebaseUp")}
                icon={<ArrowUpIcon className="h-3.5 w-3.5" />}
                onClick={() => move(i, -1)}
                disabled={i === 0}
                size="sm"
              />
              <IconButton
                label={t("git.rebaseDown")}
                icon={<ArrowDownIcon className="h-3.5 w-3.5" />}
                onClick={() => move(i, 1)}
                disabled={i === lines.length - 1}
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}

      {(firstFolds || allDropped || dirty) && (
        <p className="mt-2 text-xs text-marker">
          {dirty
            ? t("git.rebaseDirty")
            : firstFolds
              ? t("git.rebaseFirstFolds")
              : t("git.rebaseAllDropped")}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void run()}
          disabled={busy || dirty || !lines?.length || firstFolds || allDropped}
        >
          {t("git.rebaseStart")}
        </Button>
      </div>
    </Modal>
  )
}
