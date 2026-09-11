/**
 * The git operations that fix what just happened — amend, revert, cherry-pick,
 * tags, remotes.
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
  gitRefs,
  gitRemoteAdd,
  gitRemoteRemove,
  gitRemoteRename,
  gitRemotes,
  gitRevert,
  gitTagCreate,
  gitTagDelete,
  gitTags,
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
