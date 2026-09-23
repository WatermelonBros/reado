import { useEffect, useRef, useState } from "react"
import { gitInfo, listFiles, rebuildIndex, semanticRebuild } from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { baseName, useComments } from "@/lib/comments"
import { useGuidedReview } from "@/lib/guidedReview"
import { createLogger, safeError } from "@/lib/logger"
import { usePreReview } from "@/lib/preReview"
import { useQa } from "@/lib/qa"
import { useReadProgress } from "@/lib/readProgress"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useProject, useSessions, useSettings } from "@/lib/store"
import { useTours } from "@/lib/tours"
import { clearOpenFile, currentOpenFile, currentWorkspaceFile, setWindowTitle } from "@/lib/window"
import { acrossRoots, loadWorkspace, workspaceRoots } from "@/lib/workspace"
import { foldersOfWorkspaceFile } from "@/lib/workspaceFile"

const log = createLogger("project")

/**
 * Open `root` as this window's project: restore its saved session, load what
 * hangs off it, and persist the session as it changes. Returns the number of
 * files across the workspace's folders (0 until counted).
 */
export function useProjectSession(root: string): number {
  const init = useProject((s) => s.init)
  const setGit = useProject((s) => s.setGit)
  const tabs = useProject((s) => s.tabs)
  const active = useProject((s) => s.active)
  const expandedDirs = useProject((s) => s.expandedDirs)
  const splitPath = useProject((s) => s.splitPath)
  const groups = useProject((s) => s.groups)
  const focusedGroup = useProject((s) => s.focusedGroup)
  const saveSession = useSessions((s) => s.save)
  const [totalFiles, setTotalFiles] = useState(0)

  // True once the saved session has been restored. We must not persist the
  // (empty) initial state before then, or it would clobber the saved session.
  const restored = useRef(false)

  // Restore the saved session synchronously on mount, then load git info
  // separately. Doing the restore synchronously (rather than after the async
  // git call) keeps tab order deterministic and race-free.
  useEffect(() => {
    // Restore the saved session only when the setting allows; otherwise start
    // clean. The stored session is left on disk (not deleted).
    const session = useSettings.getState().restoreSession
      ? useSessions.getState().byRoot[root]
      : undefined
    init(
      root,
      {
        isRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
        changedFiles: 0,
      },
      session,
    )
    restored.current = true
    // The workspace's other folders, if this one has any. Loaded after `init`
    // (which seeds the list with the primary folder) so a slow read can never
    // leave the tree with no root at all. A window opened from a portable
    // workspace file takes its list from *that* file — the folder's own
    // `.reado/workspace.json` is what a folder opened directly uses.
    const wsFile = currentWorkspaceFile()
    useProject.getState().setWorkspaceFile(wsFile)
    void (wsFile ? foldersOfWorkspaceFile(wsFile) : loadWorkspace(root)).then((folders) => {
      for (const folder of folders) useProject.getState().addRoot(folder)
    })
    // Opened from an OS file association: open the requested file, then drop the
    // hash param so a reload doesn't re-open it.
    const openFile = currentOpenFile()
    if (openFile?.startsWith(root)) {
      useProject.getState().open(openFile)
      clearOpenFile()
    }
    setWindowTitle(baseName(root))
    useComments.getState().load(root)
    useReadProgress.getState().load(root)
    useBookmarks.getState().load(root)
    useQa.getState().load(root)
    useTours.getState().load(root)
    usePreReview.getState().load(root)
    useGuidedReview.getState().load(root)
    void useResolveLoop.getState().load(root)
    acrossRoots(workspaceRoots(), listFiles)
      .then((f) => setTotalFiles(f.length))
      .catch(() => setTotalFiles(0))
    // Build the SQLite index on open if missing/stale (rebuildable cache).
    rebuildIndex(root).catch((e) => log.warn("index rebuild failed", { error: safeError(e) }))
    // And the semantic one, so "where do we…?" answers from the first keystroke
    // rather than waiting on an agent.
    semanticRebuild(root).catch((e) =>
      log.warn("semantic index rebuild failed", { error: safeError(e) }),
    )
    gitInfo(root)
      .then(setGit)
      .catch((e) => log.warn("git info failed", { error: safeError(e) }))
  }, [root, init, setGit])

  // Persist the session whenever the open tabs, active file, tree drill-down, or
  // split pane change, so reopening the project restores all of it.
  useEffect(() => {
    if (!restored.current) return
    saveSession(root, {
      tabs,
      active,
      expanded: expandedDirs,
      split: splitPath,
      // The focused group's live fields are written back so the saved
      // arrangement describes what is on screen, not what it was at the last
      // focus change.
      groups: groups.map((g) => (g.id === focusedGroup ? { ...g, tabs, active } : g)),
      focusedGroup,
    })
  }, [root, tabs, active, expandedDirs, splitPath, groups, focusedGroup, saveSession])

  return totalFiles
}
