/**
 * The git operations that fix what just happened — amend, revert, cherry-pick,
 * tags, remotes — and the ones that reshape the branch: merge, rebase,
 * worktrees, submodules, signing.
 *
 * Each one asks for exactly what it needs and then says what happened. The
 * interesting case is the one that *cannot* apply: a revert or a cherry-pick
 * that conflicts is not an error, it is work waiting in the working tree, and
 * saying "failed" would send the reader looking for a problem that isn't there.
 */
import { ask } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import {
  gitAmend,
  gitCherryPick,
  gitHeadIsPushed,
  gitMerge,
  gitRebase,
  gitRefs,
  gitRemoteAdd,
  gitRemoteRemove,
  gitRemoteRename,
  gitRemotes,
  gitRevert,
  gitSequencerContinue,
  gitSetSigning,
  gitSigning,
  gitSubmodules,
  gitSubmoduleUpdate,
  gitTagCreate,
  gitTagDelete,
  gitTags,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitWorktrees,
} from "./api"
import { notify, notifyError } from "./notice"
import { prompt } from "./prompt"
import { useProject } from "./store"

const root = () => useProject.getState().root

/** Report an apply that could not go in cleanly as what it is. */
function reportOutcome(conflicted: string[], done: string): void {
  if (conflicted.length)
    notify(
      "info",
      t("git.applyConflicted", { count: conflicted.length, files: conflicted.join(", ") }),
    )
  else notify("success", done)
}

/**
 * Amend the last commit. The message is offered prefilled, because the usual
 * reason to amend is that the message was wrong; leaving it untouched keeps it.
 */
export async function amendLastCommit(): Promise<void> {
  const r = root()
  if (!r) return
  // Read HEAD's message now rather than holding one from when the panel
  // mounted: a revert or another commit since then would have moved it, and
  // amending with a stale message is how you rewrite the wrong thing.
  const lastMessage = await gitRefs(r)
    .then((refs) => refs.commits[0]?.subject ?? "")
    .catch(() => "")
  if (await gitHeadIsPushed(r).catch(() => false)) {
    const yes = await ask(t("git.amendPushed"), { title: t("git.amend"), kind: "warning" })
    if (!yes) return
  }
  const message = await prompt({
    title: t("git.amend"),
    value: lastMessage,
    confirmLabel: t("git.amend"),
  })
  if (message === null) return
  try {
    await gitAmend(r, message)
    notify("success", t("git.amended"))
  } catch (e) {
    notifyError("gitOps", t("git.amendFailed"), e)
  }
}

/** Undo a commit with a new one. */
export async function revertCommit(commit: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    const out = await gitRevert(r, commit)
    reportOutcome(out.conflicted, t("git.reverted"))
  } catch (e) {
    notifyError("gitOps", t("git.revertFailed"), e)
  }
}

/** Take one commit from elsewhere onto this branch. */
export async function cherryPickCommit(commit: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    const out = await gitCherryPick(r, commit)
    reportOutcome(out.conflicted, t("git.cherryPicked"))
  } catch (e) {
    notifyError("gitOps", t("git.cherryPickFailed"), e)
  }
}

/** Create a tag at HEAD, annotated when a message is given. */
export async function createTag(): Promise<void> {
  const r = root()
  if (!r) return
  const name = await prompt({ title: t("git.tagCreate"), placeholder: "v1.0.0" })
  if (!name) return
  const message = await prompt({ title: t("git.tagMessage"), placeholder: t("git.tagOptional") })
  try {
    await gitTagCreate(r, name, message ?? undefined)
    notify("success", t("git.tagged", { name }))
  } catch (e) {
    notifyError("gitOps", t("git.tagFailed", { name }), e)
  }
}

/** Remove a tag, chosen from the ones that exist. */
export async function deleteTag(name: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    await gitTagDelete(r, name)
    notify("info", t("git.tagDeleted", { name }))
  } catch (e) {
    notifyError("gitOps", t("git.tagFailed", { name }), e)
  }
}

export const listTags = () => (root() ? gitTags(root()) : Promise.resolve([]))
export const listRemotes = () => (root() ? gitRemotes(root()) : Promise.resolve([]))

/** Add a remote, asking for both halves. */
export async function addRemote(): Promise<void> {
  const r = root()
  if (!r) return
  const name = await prompt({ title: t("git.remoteAdd"), placeholder: "origin" })
  if (!name) return
  const url = await prompt({ title: t("git.remoteUrl"), placeholder: "git@host:owner/repo.git" })
  if (!url) return
  try {
    await gitRemoteAdd(r, name, url)
    notify("success", t("git.remoteAdded", { name }))
  } catch (e) {
    notifyError("gitOps", t("git.remoteFailed"), e)
  }
}

export async function renameRemote(from: string): Promise<void> {
  const r = root()
  if (!r) return
  const to = await prompt({ title: t("git.remoteRename"), value: from })
  if (!to || to === from) return
  try {
    await gitRemoteRename(r, from, to)
  } catch (e) {
    notifyError("gitOps", t("git.remoteFailed"), e)
  }
}

export async function removeRemote(name: string): Promise<void> {
  const r = root()
  if (!r) return
  const yes = await ask(t("git.remoteRemoveAsk", { name }), {
    title: t("git.remoteRemove"),
    kind: "warning",
  })
  if (!yes) return
  try {
    await gitRemoteRemove(r, name)
  } catch (e) {
    notifyError("gitOps", t("git.remoteFailed"), e)
  }
}

/** Merge a branch into the current one. */
export async function mergeBranch(branch: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    const out = await gitMerge(r, branch)
    reportOutcome(out.conflicted, t("git.merged", { branch }))
  } catch (e) {
    notifyError("gitOps", t("git.mergeFailed", { branch }), e)
  }
}

/** Replay this branch on top of another. */
export async function rebaseOnto(branch: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    const out = await gitRebase(r, branch)
    reportOutcome(out.conflicted, t("git.rebased", { branch }))
  } catch (e) {
    notifyError("gitOps", t("git.rebaseFailed", { branch }), e)
  }
}

/**
 * Carry on after a conflicted rebase / cherry-pick / revert. Committing is what
 * finishes a merge; every other sequencer operation wants `--continue`, and the
 * two are not interchangeable — so the resolver asks the repository which it is.
 */
export async function continueSequencer(): Promise<void> {
  const r = root()
  if (!r) return
  try {
    const out = await gitSequencerContinue(r)
    reportOutcome(out.conflicted, t("git.continued"))
  } catch (e) {
    notifyError("gitOps", t("git.continueFailed"), e)
  }
}

export const listWorktrees = () => (root() ? gitWorktrees(root()) : Promise.resolve([]))
export const listSubmodules = () => (root() ? gitSubmodules(root()) : Promise.resolve([]))

/**
 * Add a worktree: a second branch checked out in its own directory, which is
 * how you look at another branch without putting down what is in front of you.
 */
export async function addWorktree(): Promise<void> {
  const r = root()
  if (!r) return
  const branch = await prompt({ title: t("git.worktreeBranch"), placeholder: "feature/x" })
  if (!branch) return
  // Sibling of the project by default: a worktree inside the repository would be
  // picked up by the file tree, the search index and git status as if it were
  // part of it.
  const base = r.replace(/\/+$/, "")
  const dir = await prompt({
    title: t("git.worktreePath"),
    value: `${base}-${branch.replace(/[^\w.-]+/g, "-")}`,
  })
  if (!dir) return
  try {
    // A branch that already exists is checked out; a new name is created there.
    const existing = await gitWorktrees(r)
    const known = existing.some((w) => w.branch === branch)
    await gitWorktreeAdd(r, dir, branch, !known)
    notify("success", t("git.worktreeAdded", { path: dir }))
  } catch (e) {
    notifyError("gitOps", t("git.worktreeFailed"), e)
  }
}

/** Remove a worktree, asking first — the directory goes with it. */
export async function removeWorktree(path: string): Promise<void> {
  const r = root()
  if (!r) return
  const yes = await ask(t("git.worktreeRemoveAsk", { path }), {
    title: t("git.worktreeRemove"),
    kind: "warning",
  })
  if (!yes) return
  try {
    await gitWorktreeRemove(r, path)
    notify("info", t("git.worktreeRemoved", { path }))
  } catch (e) {
    notifyError("gitOps", t("git.worktreeFailed"), e)
  }
}

/** Clone and update submodules — all of them, or one. */
export async function updateSubmodules(path?: string): Promise<void> {
  const r = root()
  if (!r) return
  try {
    await gitSubmoduleUpdate(r, path)
    notify("success", t("git.submodulesUpdated"))
  } catch (e) {
    notifyError("gitOps", t("git.submoduleFailed"), e)
  }
}

/** Read the repository's own `commit.gpgsign`, which is where signing lives.
 *  A folder that is not a repository simply is not signing. */
export const signingOn = () =>
  root() ? gitSigning(root()).catch(() => false) : Promise.resolve(false)

export async function setSigning(on: boolean): Promise<void> {
  const r = root()
  if (!r) return
  try {
    await gitSetSigning(r, on)
    notify("info", on ? t("git.signingOn") : t("git.signingOff"))
  } catch (e) {
    notifyError("gitOps", t("git.signingFailed"), e)
  }
}
