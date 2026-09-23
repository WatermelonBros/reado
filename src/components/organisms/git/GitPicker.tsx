/**
 * The pickers behind Source Control's ⋯ menu: one list at a time — commits to
 * revert or cherry-pick, branches to merge or rebase onto, the tags, remotes,
 * worktrees and submodules — each with the action that starts it off.
 *
 * One component, one config per picker: they differ only in what they load and
 * what a row does, which are values.
 */
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { GitBranchIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import type { MessageKey } from "@/i18n"
import { gitBranches, gitRefs } from "@/lib/api"
import {
  addRemote,
  addWorktree,
  cherryPickCommit,
  createTag,
  deleteTag,
  listRemotes,
  listSubmodules,
  listTags,
  listWorktrees,
  mergeBranch,
  rebaseOnto,
  removeRemote,
  removeWorktree,
  revertCommit,
  updateSubmodules,
} from "@/lib/gitOps"
import { openProjectHere } from "@/lib/window"

/** What a picker's actions reach back into the panel for. */
export interface PickerCtx {
  root: string
  refreshAll: () => void
  /** Open the interactive-rebase planner against `onto`. */
  startRebase: (onto: string) => void
  t: (key: MessageKey) => string
}

/** One row of a picker. */
interface PickerRow {
  key: string
  icon?: ReactNode
  /** A quiet mono prefix (a commit hash). */
  lead?: string
  label: string
  /** A quiet trailing note (a URL, a path, a state). */
  detail?: string
  onSelect: () => void
  /** A second, destructive action on the same row. */
  remove?: { label: string; onSelect: () => void }
}

interface PickerDef<T> {
  label: MessageKey
  load: (root: string) => Promise<T[]>
  /** The row above the list that adds rather than picks. */
  first?: (items: T[], ctx: PickerCtx) => { label: MessageKey; onSelect: () => void }
  /** Said when the list is empty. */
  empty?: MessageKey
  row: (item: T, ctx: PickerCtx) => PickerRow
}

const def = <T,>(d: PickerDef<T>) => d as PickerDef<unknown>

/** The current branch is not a thing to merge or rebase onto itself. */
const otherBranches = (root: string) =>
  gitBranches(root).then((b) => [...b.local, ...b.remote].filter((n) => n !== b.current))
const commits = (root: string) => gitRefs(root).then((r) => r.commits)

/** The menu entries that do nothing but open a picker, in menu order. */
export const PICKERS = {
  revert: def({
    label: "git.revert",
    load: commits,
    row: (c, { refreshAll }) => ({
      key: c.hash,
      lead: c.hash.slice(0, 7),
      label: c.subject,
      onSelect: () => void revertCommit(c.hash).then(refreshAll),
    }),
  }),
  cherry: def({
    label: "git.cherryPick",
    load: commits,
    row: (c, { refreshAll }) => ({
      key: c.hash,
      lead: c.hash.slice(0, 7),
      label: c.subject,
      onSelect: () => void cherryPickCommit(c.hash).then(refreshAll),
    }),
  }),
  merge: def({
    label: "git.merge",
    load: otherBranches,
    empty: "git.noBranches",
    row: (b, { refreshAll }) => ({
      key: b,
      icon: <GitBranchIcon className="h-3.5 w-3.5 text-muted" />,
      label: b,
      onSelect: () => void mergeBranch(b).then(refreshAll),
    }),
  }),
  rebase: def({
    label: "git.rebase",
    load: otherBranches,
    first: (branches, { startRebase }) => ({
      label: "git.rebasePick",
      onSelect: () => {
        const onto = branches[0]
        if (onto) startRebase(onto)
      },
    }),
    empty: "git.noBranches",
    row: (b, { refreshAll }) => ({
      key: b,
      icon: <GitBranchIcon className="h-3.5 w-3.5 text-muted" />,
      label: b,
      onSelect: () => void rebaseOnto(b).then(refreshAll),
    }),
  }),
  worktrees: def({
    label: "git.worktrees",
    load: () => listWorktrees(),
    first: (_, { refreshAll }) => ({
      label: "git.worktreeAdd",
      onSelect: () => void addWorktree().then(refreshAll),
    }),
    row: (w, { refreshAll, t }) => ({
      key: w.path,
      label: w.branch ?? t("git.detached"),
      detail: w.path,
      onSelect: () => void openProjectHere(w.path),
      remove: w.isMain
        ? undefined
        : {
            label: t("git.worktreeRemove"),
            onSelect: () => void removeWorktree(w.path).then(refreshAll),
          },
    }),
  }),
  submodules: def({
    label: "git.submodules",
    load: () => listSubmodules(),
    first: (_, { refreshAll }) => ({
      label: "git.submodulesUpdate",
      onSelect: () => void updateSubmodules().then(refreshAll),
    }),
    empty: "git.noSubmodules",
    row: (m, { root, refreshAll, t }) => ({
      key: m.path,
      label: m.path,
      detail: m.initialized
        ? m.modified
          ? t("git.submoduleModified")
          : m.sha.slice(0, 7)
        : t("git.submoduleMissing"),
      onSelect: () =>
        void (m.initialized
          ? openProjectHere(`${root}/${m.path}`)
          : updateSubmodules(m.path).then(refreshAll)),
    }),
  }),
  tags: def({
    label: "git.tags",
    load: () => listTags(),
    first: (_, { refreshAll }) => ({
      label: "git.tagCreate",
      onSelect: () => void createTag().then(refreshAll),
    }),
    row: (name, { refreshAll, t }) => ({
      key: name,
      label: name,
      detail: t("git.tagDelete"),
      onSelect: () => void deleteTag(name).then(refreshAll),
    }),
  }),
  remotes: def({
    label: "git.remotes",
    load: () => listRemotes(),
    first: (_, { refreshAll }) => ({
      label: "git.remoteAdd",
      onSelect: () => void addRemote().then(refreshAll),
    }),
    row: (r, { refreshAll }) => ({
      key: r.name,
      label: r.name,
      detail: r.url,
      onSelect: () => void removeRemote(r.name).then(refreshAll),
    }),
  }),
}

export type PickerId = keyof typeof PICKERS

const ROW = "flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface"

/** The open picker, as a dialog. Every choice closes it before it runs. */
export function GitPicker({
  picking,
  onClose,
  ctx,
}: {
  picking: PickerId | null
  onClose: () => void
  ctx: Omit<PickerCtx, "t">
}) {
  const { t } = useTranslation()
  const picker = picking ? PICKERS[picking] : null
  const [items, setItems] = useState<unknown[]>([])
  // Load what the open picker needs, and nothing else.
  useEffect(() => {
    setItems([])
    if (picker) void picker.load(ctx.root).then(setItems)
  }, [picker, ctx.root])

  const full: PickerCtx = { ...ctx, t: (k) => t(k) }
  const choose = (run: () => void) => () => {
    onClose()
    run()
  }
  const first = picker?.first?.(items, full)
  return (
    <Modal
      open={!!picker}
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={picker ? t(picker.label) : undefined}
      className="max-h-[50vh] w-[28rem] overflow-y-auto py-1 text-sm"
    >
      {first && (
        <button type="button" onClick={choose(first.onSelect)} className={`${ROW} text-ink`}>
          {t(first.label)}
        </button>
      )}
      {picker?.empty && items.length === 0 && (
        <p className="px-3 py-1.5 text-xs text-faint">{t(picker.empty)}</p>
      )}
      {picker &&
        items.map((item) => {
          const r = picker.row(item, full)
          return (
            <div key={r.key} className="flex w-full items-center">
              <button
                type="button"
                onClick={choose(r.onSelect)}
                className={`${ROW} min-w-0 flex-1`}
              >
                {r.icon}
                {r.lead && (
                  <span className="flex-none font-mono text-[10px] text-faint">{r.lead}</span>
                )}
                <span className="min-w-0 truncate text-ink">{r.label}</span>
                {r.detail && (
                  <span className="ml-auto min-w-0 truncate text-[10px] text-faint">
                    {r.detail}
                  </span>
                )}
              </button>
              {r.remove && (
                <button
                  type="button"
                  onClick={choose(r.remove.onSelect)}
                  className="flex-none px-3 text-[10px] text-marker hover:underline"
                >
                  {r.remove.label}
                </button>
              )}
            </div>
          )
        })}
    </Modal>
  )
}
