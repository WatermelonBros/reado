/**
 * The Source Control side panel.
 *
 * Surfaces the working-tree changes split into staged and unstaged groups, lets
 * you stage / unstage / discard individual files (or all), and commit the staged
 * set with a message. Selecting a file opens it with the diff view on so you can
 * see what changed (including the agent's edits).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import {
  CloseIcon,
  DiscardIcon,
  FetchIcon,
  GitBranchIcon,
  MinusIcon,
  MoreIcon,
  PlusIcon,
  PullIcon,
  PushIcon,
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
  gitInfo,
  gitPull,
  gitPush,
  gitStage,
  gitStageAll,
  gitStash,
  gitStashApply,
  gitStashDrop,
  gitStashList,
  gitStashPop,
  gitStatus,
  gitSync,
  gitUnstage,
  gitUnstageAll,
  type StashEntry,
  submitToTerminal,
} from "@/lib/api"
import { notify } from "@/lib/notice"
import { composeCommitPrompt } from "@/lib/review"
import { useEditorActions, useProject } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** Single-letter badge + colour per change category. */
const STATUS: Record<GitChange["status"], { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--syn-number)" },
  added: { letter: "A", color: "var(--syn-string)" },
  deleted: { letter: "D", color: "var(--marker)" },
  renamed: { letter: "R", color: "var(--syn-keyword)" },
  untracked: { letter: "U", color: "var(--text-faint)" },
  conflicted: { letter: "!", color: "var(--diag-error)" },
}

const basename = (p: string) => p.split("/").pop() ?? p
const dirname = (p: string) => {
  const i = p.lastIndexOf("/")
  return i > 0 ? p.slice(0, i) : ""
}

export function GitPanel() {
  const root = useProject((s) => s.root)
  const open = useProject((s) => s.open)
  const git = useProject((s) => s.git)
  const setGit = useProject((s) => s.setGit)
  const activeTerminal = useTerminals((s) => s.activeId)
  const addTerminal = useTerminals((s) => s.add)
  const { t } = useTranslation()
  const [changes, setChanges] = useState<GitChange[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  // Path armed for discard confirmation (inline, like the comment delete flow).
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)
  // Stash index armed for drop confirmation (inline, like discardDiscard above).
  const [confirmDropStash, setConfirmDropStash] = useState<number | null>(null)
  // Repo-level "more actions" dropdown + its data.
  const [menuOpen, setMenuOpen] = useState(false)
  // The "more" menu is positioned with fixed coords (to the right of the dots) so
  // it escapes the sidebar's overflow clipping entirely.
  const dotsRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [branchName, setBranchName] = useState<string | null>(null) // null = input hidden
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    gitStatus(root)
      .then(setChanges)
      .catch(() => setChanges([]))
  }, [root])

  const refreshStashes = useCallback(() => {
    gitStashList(root)
      .then(setStashes)
      .catch(() => setStashes([]))
  }, [root])

  // Refresh ahead/behind/remote after a repo op so the push/sync affordances
  // reflect the new state (a commit adds to `ahead`, a push clears it).
  const refreshInfo = useCallback(() => {
    gitInfo(root)
      .then(setGit)
      .catch(() => {})
  }, [root, setGit])

  useEffect(() => {
    refresh()
    refreshInfo()
    // Keep the view fresh as the tree changes (cheap, debounced by interval).
    // Skip the poll while the window is hidden — nothing to refresh for.
    // `refreshInfo` rides along so the rail's badge can't disagree with the list
    // the panel is showing: the count and the list are the same fact, and only
    // one of them being refreshed is how they drift apart.
    const id = window.setInterval(() => {
      if (document.hidden) return
      refresh()
      refreshInfo()
    }, 4000)
    return () => clearInterval(id)
  }, [refresh, refreshInfo])

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

  // Render functions, not components: declared in the body, a component is a
  // fresh type each render, and the 4s status poll would remount every row —
  // now that each row carries IconButtons, that tears down their tooltip
  // machines fifteen times a minute.
  const row = (c: GitChange, key: string) => {
    const s = STATUS[c.status]
    return (
      <li key={key} className="group/row">
        <div className="flex items-center gap-2 px-3 py-1 text-sm transition-colors hover:bg-surface">
          <button
            type="button"
            onClick={() => select(c)}
            title={c.path}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate text-ink">{basename(c.path)}</span>
            <span className="truncate text-xs text-faint">{dirname(c.path)}</span>
          </button>
          {confirmDiscard === c.path ? (
            <InlineConfirm
              question={`${t("git.discard")}?`}
              confirmLabel={t("comment.delete")}
              onConfirm={() => discard(c)}
              onCancel={() => setConfirmDiscard(null)}
            />
          ) : (
            <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
              {!c.staged && (
                <IconButton
                  size="xs"
                  danger
                  label={t("git.discard")}
                  icon={<DiscardIcon className="h-3.5 w-3.5" />}
                  onClick={() => setConfirmDiscard(c.path)}
                />
              )}
              <IconButton
                size="xs"
                label={c.staged ? t("git.unstage") : t("git.stage")}
                icon={
                  c.staged ? (
                    <MinusIcon className="h-3.5 w-3.5" />
                  ) : (
                    <PlusIcon className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => act(c.staged ? gitUnstage(root, c.path) : gitStage(root, c.path))}
              />
            </div>
          )}
          <span className="flex-none font-mono text-xs font-semibold" style={{ color: s.color }}>
            {s.letter}
          </span>
        </div>
      </li>
    )
  }

  const groupHeader = (
    label: string,
    count: number,
    actions: { onClick: () => void; label: string; Icon: typeof PlusIcon; danger?: boolean }[],
  ) => (
    <div className="group/hdr flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
      <span>{label}</span>
      <span className="text-faint">{count}</span>
      <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/hdr:opacity-100 group-focus-within/hdr:opacity-100">
        {actions.map((a) => (
          <IconButton
            key={a.label}
            size="xs"
            danger={a.danger}
            label={a.label}
            icon={<a.Icon className="h-3.5 w-3.5" />}
            onClick={a.onClick}
          />
        ))}
      </div>
    </div>
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
        <div ref={dotsRef} className="ml-auto">
          {toolButton(
            "more",
            () => {
              const next = !menuOpen
              if (next) {
                const r = dotsRef.current?.getBoundingClientRect()
                if (r) setMenuPos({ top: r.top, left: r.right + 6 })
                refreshStashes()
              }
              setMenuOpen(next)
            },
            t("git.more"),
            MoreIcon,
          )}
          {menuOpen && menuPos && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div
                className="fixed z-30 w-60 overflow-y-auto rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  maxHeight: `calc(100vh - ${menuPos.top}px - 8px)`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setBranchName("")
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface"
                >
                  <GitBranchIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.newBranch")}
                </button>
                <button
                  type="button"
                  onClick={() => runRepo(gitStash(root, "", false))}
                  disabled={changes.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface disabled:opacity-40"
                >
                  <StashIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.stash")}
                </button>
                <button
                  type="button"
                  onClick={() => runRepo(gitStash(root, "", true))}
                  disabled={changes.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface disabled:opacity-40"
                >
                  <StashIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.stashUntracked")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmDiscardAll(true)
                  }}
                  disabled={unstaged.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-marker hover:bg-surface disabled:opacity-40"
                >
                  <DiscardIcon className="h-3.5 w-3.5" />
                  {t("git.discardAll")}
                </button>

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
                      <span
                        className="min-w-0 flex-1 truncate text-xs text-muted"
                        title={s.message}
                      >
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
              </div>
            </>
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
              {groupHeader(t("git.staged"), staged.length, [
                {
                  onClick: () => act(gitUnstageAll(root)),
                  label: t("git.unstageAll"),
                  Icon: MinusIcon,
                },
              ])}
              <ul className="m-0 list-none p-0">
                {staged.map((c, i) => row(c, `s:${i}:${c.path}`))}
              </ul>
            </>
          )}
          {unstaged.length > 0 && (
            <>
              {groupHeader(t("git.changes"), unstaged.length, [
                {
                  onClick: () => setConfirmDiscardAll(true),
                  label: t("git.discardAll"),
                  Icon: DiscardIcon,
                  danger: true,
                },
                { onClick: () => act(gitStageAll(root)), label: t("git.stageAll"), Icon: PlusIcon },
              ])}
              <ul className="m-0 list-none p-0">
                {unstaged.map((c, i) => row(c, `u:${i}:${c.path}`))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
