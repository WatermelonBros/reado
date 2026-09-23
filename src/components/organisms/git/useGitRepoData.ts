import { useCallback, useEffect, useState } from "react"
import { gitInfo, gitStashList, type StashEntry } from "@/lib/api"
import { useGitStatus } from "@/lib/gitStatus"
import { useProject } from "@/lib/store"

/**
 * The repository state Source Control shows beyond the change list, and the
 * poll that keeps it fresh. The change list itself lives in `useGitStatus`: the
 * file tree decorates its rows from the same fetch.
 */
export function useGitRepoData(root: string) {
  const setGit = useProject((s) => s.setGit)
  const [stashes, setStashes] = useState<StashEntry[]>([])

  const refresh = useCallback(() => {
    void useGitStatus.getState().refresh(root)
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

  /** After an operation that can move HEAD or the working tree, re-read both. */
  const refreshAll = useCallback(() => {
    refresh()
    refreshInfo()
  }, [refresh, refreshInfo])

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

  return { stashes, refresh, refreshStashes, refreshInfo, refreshAll }
}
