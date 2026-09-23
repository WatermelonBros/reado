import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { t as translate } from "@/i18n"
import {
  gitInfo,
  readFile,
  reanchorFile,
  rebuildIndex,
  resolvePath,
  semanticReindexFile,
  startWatching,
} from "@/lib/api"
import { toRelative, useComments } from "@/lib/comments"
import { useGuidedReview } from "@/lib/guidedReview"
import { createLogger, safeError } from "@/lib/logger"
import { notifyWatchedFileChanged } from "@/lib/lsp"
import { moodOf, useMascot } from "@/lib/mascot"
import { notifyError } from "@/lib/notice"
import { notifyAgentDone } from "@/lib/notify"
import { useReadProgress, wasSelfWrite } from "@/lib/readProgress"
import { useReasoning } from "@/lib/reasoning"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useProject } from "@/lib/store"

const log = createLogger("project")

/** The project's on-disk and agent events, each routed to the store it refreshes. */
export function useProjectWatcher(root: string): void {
  const setGit = useProject((s) => s.setGit)

  // Watch the project and re-anchor a file's comments when it changes on disk
  // (external edits, or the agent's own writes).
  useEffect(() => {
    // A failed watcher silently breaks live refresh (external edits, agent writes
    // won't show) — surface it so the user knows updates won't stream in.
    startWatching(root).catch((e) => notifyError("project", translate("notice.watchFailed"), e))
    // Coalesce tree refreshes: a burst of file-changed events (e.g. an agent
    // bulk-editing) would otherwise trigger one full repo re-walk + tree re-list
    // per file. Debounce bumpTree() to fire once after the burst settles.
    let treeTimer: ReturnType<typeof setTimeout> | null = null
    const bumpTreeSoon = () => {
      if (treeTimer) clearTimeout(treeTimer)
      treeTimer = setTimeout(() => {
        treeTimer = null
        useProject.getState().bumpTree()
        // Editing a file changes the working tree but touches nothing under
        // `.git`, so no `git-changed` arrives — refresh here too, or the Source
        // Control badge only catches up on the next commit or checkout.
        gitInfo(root)
          .then(setGit)
          .catch((e) => log.warn("git info failed", { error: safeError(e) }))
      }, 250)
    }
    const offs = [
      listen<{ file: string }>("file-changed", (event) => {
        const { file } = event.payload
        // An external change (e.g. an agent's edit) to a file marked read means
        // there's new content to look at — flag the delta *before* unmarking
        // (mark(read=false) keeps the snapshot), then flip it to unread. Our own
        // saves are suppressed via wasSelfWrite.
        if (!wasSelfWrite(file) && useReadProgress.getState().read.has(file)) {
          useReadProgress.getState().markChanged(file)
          useReadProgress.getState().mark(root, file, false)
        }
        reanchorFile(root, file)
          .then((list) => useComments.getState().replaceForFile(file, list))
          .catch(() => {})
        // A language server that registered for watched files is entitled to
        // hear about this one — otherwise its picture of the project ages.
        notifyWatchedFileChanged(root, file)
        // Keep the semantic index current, one file at a time — a full rebuild
        // per keystroke-triggered save would be the wrong shape entirely.
        semanticReindexFile(root, file).catch((e) =>
          log.warn("semantic reindex failed", { error: safeError(e) }),
        )
        // Re-list the tree so files created/moved/deleted on disk (or dragged in
        // from outside) show up without a manual refresh — coalesced so a burst
        // of edits only walks the tree once.
        bumpTreeSoon()
        // If a file open in a tab was deleted on disk, close the tab instead of
        // leaving a broken editor (VS Code behaviour).
        const { tabs, close } = useProject.getState()
        // Tabs hold absolute paths; pass the absolute path so resolve_path checks
        // it against the project root (a relative path would fail to canonicalize
        // and wrongly close the tab on every edit). `resolvePath` is the existence
        // probe this needs — `readFile` would ship the whole file body across IPC
        // on every save just to be thrown away.
        const tab = tabs.find((p) => toRelative(root, p) === file)
        if (tab) {
          resolvePath(root, tab)
            .then((found) => {
              if (!found) close(tab)
            })
            .catch(() => close(tab))
        }
      }),
      // An agent mutated comments via the `reado` CLI — reload the list so the
      // UI reflects done/reply/add without a manual refresh.
      listen("comments-changed", () => {
        useComments
          .getState()
          .load(root)
          // The resolve loop tracks progress by watching comments resolve.
          .then(() => useResolveLoop.getState().sync(root))
          .catch((e) => log.warn("resolve-loop sync failed", { error: safeError(e) }))
        rebuildIndex(root).catch((e) => log.warn("index rebuild failed", { error: safeError(e) }))
      }),
      // A guided review advanced (the agent planned a route or proposed an
      // artifact via the CLI) — reload sessions so the Review Guide stays live.
      listen("sessions-changed", () => {
        useGuidedReview.getState().load(root)
      }),
      // The agent narrated a reasoning line via `reado thought` — refresh the
      // live reasoning feed docked beside the terminal.
      listen("reasoning-changed", () => {
        useReasoning.getState().load(root)
      }),
      // The agent called `session_done` over MCP: it is handing the turn back.
      // The user has usually walked away, which is the whole point of the
      // notification and the chime.
      listen("agent-done", async () => {
        const c = await readFile(root, `${root}/.reado/done.json`, true).catch(() => null)
        if (c?.kind !== "text") return
        try {
          const { status, summary } = JSON.parse(c.text) as { status: string; summary: string }
          notifyAgentDone(status, summary)
        } catch {
          /* a half-written file: the next write brings the whole one */
        }
      }),
      // The agent asked the mascot to say something (`mascot_say` over MCP).
      // Same channel as the handoff: one file, most recent wins.
      listen("mascot-say", async () => {
        const c = await readFile(root, `${root}/.reado/mascot.json`, true).catch(() => null)
        if (c?.kind !== "text") return
        try {
          const { text, mood } = JSON.parse(c.text) as { text: string; mood?: string }
          if (text) useMascot.getState().say(text, moodOf(mood))
        } catch {
          /* a half-written file: the next write brings the whole one */
        }
      }),
      // The branch changed on disk (e.g. `git checkout` in the terminal) — refresh
      // git state so the status bar shows the real branch.
      listen("git-changed", () => {
        gitInfo(root)
          .then(setGit)
          .catch((e) => log.warn("git info failed", { error: safeError(e) }))
      }),
    ]
    return () => {
      if (treeTimer) clearTimeout(treeTimer)
      offs.forEach((p) => void p.then((off) => off()).catch(() => {}))
    }
  }, [root])
}
