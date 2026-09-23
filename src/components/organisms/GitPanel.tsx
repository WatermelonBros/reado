import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import {
  CloseIcon,
  DiscardIcon,
  FetchIcon,
  GitBranchIcon,
  GraphIcon,
  MinusIcon,
  MoreIcon,
  PlusIcon,
  PullIcon,
  PushIcon,
  SealCheckIcon,
  SparkleIcon,
  StashIcon,
  SyncIcon,
} from "@/components/atoms/icons"
import { Textarea } from "@/components/atoms/Textarea"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import {
  type GitChange,
  gitCommit,
  gitCreateBranch,
  gitDiscard,
  gitDiscardAll,
  gitFetch,
  gitPull,
  gitPush,
  gitStage,
  gitStageAll,
  gitStash,
  gitStashApply,
  gitStashDrop,
  gitStashPop,
  gitSync,
  gitUnstage,
  gitUnstageAll,
  submitToTerminal,
} from "@/lib/api"
import { amendLastCommit, setSigning, signingOn } from "@/lib/gitOps"
import { useGitStatus } from "@/lib/gitStatus"
import { notify } from "@/lib/notice"
import { composeCommitPrompt } from "@/lib/review"
import { useEditorActions, useProject, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { GitChangeRow, GitGroupHeader } from "./git/GitChangeRow"
import { GitPicker, PICKERS, type PickerId } from "./git/GitPicker"
import { useGitRepoData } from "./git/useGitRepoData"
import { RebaseDialog } from "./RebaseDialog"

export function GitPanel() {
  const root = useProject((s) => s.root)
  const open = useProject((s) => s.open)
  const git = useProject((s) => s.git)
  const activeTerminal = useTerminals((s) => s.activeId)
  const addTerminal = useTerminals((s) => s.add)
  const { t } = useTranslation()
  // The status lives in a store: the file tree decorates its rows from the same
  // fetch instead of running `git status` on its own poll.
  const changes = useGitStatus((s) => s.changes)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  // Path armed for discard confirmation (inline, like the comment delete flow).
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)
  // Stash index armed for drop confirmation (inline, like discardDiscard above).
  const [confirmDropStash, setConfirmDropStash] = useState<number | null>(null)
  // Repo-level "more actions" dropdown.
  const [menuOpen, setMenuOpen] = useState(false)
  const [branchName, setBranchName] = useState<string | null>(null) // null = input hidden
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Which picker is open — the commit list for revert/cherry-pick, or the tag
   *  and remote lists. One at a time, so the panel never stacks two questions. */
  const [picking, setPicking] = useState<PickerId | null>(null)
  /** The branch an interactive rebase is being planned against; null = closed. */
  const [rebasing, setRebasing] = useState<string | null>(null)
  const [signing, setSigningState] = useState(false)

  const { stashes, refresh, refreshStashes, refreshInfo, refreshAll } = useGitRepoData(root)

  const staged = changes.filter((c) => c.staged)
  const unstaged = changes.filter((c) => !c.staged)

  // Clicking a file here means "show me what changed", the way it does in every
  // other git client — so it opens as its diff, not as the plain file. The view
  // is requested before the open so the editor lands in it directly, instead of
  // opening plain and being switched a render later.
  const select = (c: GitChange) => {
    if (c.status === "deleted") return
    // A conflicted file opens in the resolver: its diff against HEAD is mostly
    // conflict markers, which is not the thing to read.
    useEditorActions.getState().requestView(c.status === "conflicted" ? "conflict" : "diff")
    open(`${root}/${c.path}`)
  }

  // Run a mutation, then refresh — optimism isn't worth a stale index here.
  const act = (p: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    p.then(() => {
      refresh()
      refreshInfo()
    })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  // Repo-level op (fetch/pull/push/stash/…): refresh status, stashes and
  // ahead/behind, close the menu, and surface git's stderr on failure.
  const runRepo = (p: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setMenuOpen(false)
    p.then(() => {
      refresh()
      refreshStashes()
      refreshInfo()
    })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  // Sync = pull then push. A conflict isn't an error: the backend reports the
  // conflicted files (which then show in the list) and we point the user at them.
  const sync = () => {
    setBusy(true)
    setError(null)
    setMenuOpen(false)
    gitSync(root)
      .then((res) => {
        refresh()
        refreshStashes()
        refreshInfo()
        if (res.conflicted.length > 0) {
          notify("info", t("git.syncConflicts", { count: res.conflicted.length }))
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const discard = (c: GitChange) => {
    setConfirmDiscard(null)
    act(gitDiscard(root, c.path, c.status === "untracked"))
  }

  const createBranch = () => {
    const name = (branchName ?? "").trim()
    if (!name) return
    setBranchName(null)
    runRepo(gitCreateBranch(root, name))
  }

  const commit = () => {
    if (!message.trim() || staged.length === 0) return
    setBusy(true)
    setError(null)
    gitCommit(root, message.trim())
      .then(() => {
        setMessage("")
        refresh()
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  // Hand the commit+push off to the agent in the terminal: it reviews the diff,
  // writes the message, commits and pushes.
  const aiCommit = () => {
    const id = activeTerminal ?? addTerminal()
    submitToTerminal(id, composeCommitPrompt(), id === activeTerminal ? 0 : 400)
  }

  const changeRow = (c: GitChange, key: string) => (
    <GitChangeRow
      key={key}
      change={c}
      confirming={confirmDiscard === c.path}
      onSelect={() => select(c)}
      onArmDiscard={setConfirmDiscard}
      onDiscard={() => discard(c)}
      onToggleStage={() => act(c.staged ? gitUnstage(root, c.path) : gitStage(root, c.path))}
    />
  )

  const toolButton = (
    key: string,
    onClick: () => void,
    label: string,
    Icon: typeof PlusIcon,
    disabled?: boolean,
    overlay?: React.ReactNode,
  ) => (
    <IconButton
      key={key}
      onClick={onClick}
      disabled={busy || disabled}
      label={label}
      className={overlay ? "relative" : undefined}
      overlay={overlay}
      icon={<Icon className="h-4 w-4" />}
    />
  )

  // Remote affordances: what can each action actually do right now?
  const { ahead, behind, hasRemote, hasUpstream } = git
  const canPush = hasRemote && (!hasUpstream || ahead > 0)
  const canSync = hasRemote && (ahead > 0 || behind > 0 || hasUpstream)
  // Tooltip that spells out the pending counts, e.g. "Sync (↓2 ↑1)".
  const counts = [behind > 0 ? `↓${behind}` : "", ahead > 0 ? `↑${ahead}` : ""]
    .filter(Boolean)
    .join(" ")
  const syncLabel = counts ? `${t("git.sync")} (${counts})` : t("git.sync")
  // One number on the badge — the tooltip already spells out the split.
  const pending = ahead + behind

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Repo toolbar: fetch / pull / push, plus a "more" menu */}
      <div className="relative flex flex-none items-center gap-0.5 border-b border-line px-2 py-1.5">
        {toolButton(
          "sync",
          sync,
          syncLabel,
          SyncIcon,
          !canSync,
          // The pending count belongs to Sync, so it rides on that button as a
          // badge. As a bare number beside it, it read as a fourth (dead) icon.
          pending > 0 ? (
            <Badge className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 text-[9px] font-bold">
              {pending}
            </Badge>
          ) : undefined,
        )}
        {toolButton("fetch", () => runRepo(gitFetch(root)), t("git.fetch"), FetchIcon, !hasRemote)}
        {toolButton("pull", () => runRepo(gitPull(root)), t("git.pull"), PullIcon, !hasRemote)}
        {toolButton("push", () => runRepo(gitPush(root)), t("git.push"), PushIcon, !canPush)}
        <div className="ml-auto">
          <Dropdown
            label={t("git.more")}
            placement="right"
            open={menuOpen}
            onOpenChange={(next) => {
              if (next) {
                refreshStashes()
                // Read signing from the repository each time: it lives in git's
                // own config, which the user may have changed elsewhere.
                void signingOn().then(setSigningState)
              }
              setMenuOpen(next)
            }}
            triggerAsChild
            trigger={
              <IconButton
                disabled={busy}
                label={t("git.more")}
                icon={<MoreIcon className="h-4 w-4" />}
              />
            }
            className="max-h-[var(--available-height)] w-60 overflow-y-auto text-sm"
          >
            <MenuRow
              icon={<GitBranchIcon className="h-3.5 w-3.5 text-muted" />}
              label={t("git.newBranch")}
              onClick={() => setBranchName("")}
            />
            {/* Fixing what just happened, and reshaping the branch. These
                used to mean leaving for a terminal, which is the one place a
                read-first editor should not have to send anyone. */}
            <MenuRow
              icon={<GitBranchIcon className="h-3.5 w-3.5 text-muted" />}
              label={t("git.amend")}
              onClick={() => void amendLastCommit().then(refreshAll)}
            />
            {(Object.keys(PICKERS) as PickerId[]).map((key) => (
              <MenuRow
                key={key}
                icon={<GitBranchIcon className="h-3.5 w-3.5 text-muted" />}
                label={t(PICKERS[key].label)}
                onClick={() => setPicking(key)}
              />
            ))}
            <MenuRow
              icon={<GraphIcon className="h-3.5 w-3.5 text-muted" />}
              label={t("gitGraph.title")}
              onClick={() => useWorkspace.getState().toggleGitGraph(true)}
            />
            <MenuRow
              icon={<SealCheckIcon className="h-3.5 w-3.5 text-muted" />}
              label={signing ? t("git.signingDisable") : t("git.signingEnable")}
              onClick={() => {
                const next = !signing
                setSigningState(next)
                void setSigning(next)
              }}
            />
            <MenuRow
              icon={<StashIcon className="h-3.5 w-3.5 text-muted" />}
              label={t("git.stash")}
              disabled={changes.length === 0}
              onClick={() => runRepo(gitStash(root, "", false))}
            />
            <MenuRow
              icon={<StashIcon className="h-3.5 w-3.5 text-muted" />}
              label={t("git.stashUntracked")}
              disabled={changes.length === 0}
              onClick={() => runRepo(gitStash(root, "", true))}
            />
            <MenuRow
              icon={<DiscardIcon className="h-3.5 w-3.5" />}
              label={t("git.discardAll")}
              danger
              disabled={unstaged.length === 0}
              onClick={() => setConfirmDiscardAll(true)}
            />

            {/* The stashes are rows with actions of their own, not menu items:
                each one offers three, and one of those asks first. */}
            <div className="mt-1 border-t border-line px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-faint uppercase">
              {t("git.stashes")}
            </div>
            {stashes.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-faint">{t("git.noStashes")}</p>
            ) : (
              stashes.map((s) => (
                <div
                  key={s.index}
                  className="group/stash flex items-center gap-1 px-3 py-1 hover:bg-surface"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-muted" title={s.message}>
                    {s.message}
                  </span>
                  {confirmDropStash === s.index ? (
                    <InlineConfirm
                      question={t("git.stashDropConfirm")}
                      confirmLabel={t("git.stashDrop")}
                      onConfirm={() => {
                        setConfirmDropStash(null)
                        runRepo(gitStashDrop(root, s.index))
                      }}
                      onCancel={() => setConfirmDropStash(null)}
                    />
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100"
                        onClick={() => runRepo(gitStashApply(root, s.index))}
                      >
                        {t("git.stashApply")}
                      </Button>
                      <Button
                        size="sm"
                        className="opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100"
                        onClick={() => runRepo(gitStashPop(root, s.index))}
                      >
                        {t("git.stashPop")}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmDropStash(s.index)}
                        className="flex-none text-xs text-muted opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100 hover:text-marker"
                      >
                        {t("git.stashDrop")}
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </Dropdown>
          <GitPicker
            picking={picking}
            onClose={() => setPicking(null)}
            ctx={{ root, refreshAll, startRebase: setRebasing }}
          />
          {rebasing && (
            <RebaseDialog
              upstream={rebasing}
              onClose={() => setRebasing(null)}
              onDone={refreshAll}
            />
          )}
        </div>
      </div>

      {/* New-branch inline input */}
      {branchName !== null && (
        <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
          <Input
            autoFocus
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createBranch()
              if (e.key === "Escape") setBranchName(null)
            }}
            placeholder={t("git.newBranchPlaceholder")}
            className="min-w-0 flex-1 px-2"
          />
          <IconButton
            size="sm"
            onClick={() => setBranchName(null)}
            label={t("common.cancel")}
            icon={<CloseIcon className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {error && (
        <div className="flex-none border-b border-line bg-surface px-3 py-1.5 text-xs text-marker">
          {error}
        </div>
      )}

      {confirmDiscardAll && (
        <div className="flex-none border-b border-line bg-surface px-3 py-2 text-xs">
          <InlineConfirm
            className="flex-col items-start gap-1.5"
            question={t("git.discardAllConfirm")}
            confirmLabel={t("git.discardAll")}
            onConfirm={() => {
              setConfirmDiscardAll(false)
              act(gitDiscardAll(root, true))
            }}
            onCancel={() => setConfirmDiscardAll(false)}
          />
        </div>
      )}

      {/* Commit box */}
      <div className="flex-none border-b border-line p-2">
        {/* A standalone composer, so it takes the bordered field the rest of the
          app uses — `filled` is for a field sitting inside an already-bordered
          container, which this isn't. */}
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onSubmit={commit}
          placeholder={t("git.commitPlaceholder")}
          rows={1}
          className="max-h-32 min-h-8"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={commit}
          disabled={busy || !message.trim() || staged.length === 0}
          title={staged.length === 0 ? t("git.nothingStaged") : t("git.commit")}
          className="mt-1.5 w-full"
        >
          {busy ? t("git.committing") : t("git.commit")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={aiCommit}
          disabled={changes.length === 0}
          title={changes.length === 0 ? t("git.clean") : t("git.aiCommit")}
          className="mt-1.5 w-full"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
          {t("git.aiCommit")}
        </Button>
      </div>

      {changes.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("git.clean")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {staged.length > 0 && (
            <>
              <GitGroupHeader
                label={t("git.staged")}
                count={staged.length}
                actions={[
                  {
                    onClick: () => act(gitUnstageAll(root)),
                    label: t("git.unstageAll"),
                    Icon: MinusIcon,
                  },
                ]}
              />
              <ul className="m-0 list-none p-0">
                {staged.map((c, i) => changeRow(c, `s:${i}:${c.path}`))}
              </ul>
            </>
          )}
          {unstaged.length > 0 && (
            <>
              <GitGroupHeader
                label={t("git.changes")}
                count={unstaged.length}
                actions={[
                  {
                    onClick: () => setConfirmDiscardAll(true),
                    label: t("git.discardAll"),
                    Icon: DiscardIcon,
                    danger: true,
                  },
                  {
                    onClick: () => act(gitStageAll(root)),
                    label: t("git.stageAll"),
                    Icon: PlusIcon,
                  },
                ]}
              />
              <ul className="m-0 list-none p-0">
                {unstaged.map((c, i) => changeRow(c, `u:${i}:${c.path}`))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
