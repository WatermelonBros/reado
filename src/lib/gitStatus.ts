/**
 * The working tree's status, shared.
 *
 * Source Control was the only thing that knew which files git considers changed,
 * and it kept that in component state — so the file tree, which wants to say the
 * same thing on the same rows, had no way to read it without fetching (and
 * polling) the very same command a second time. One store, one poll, both views.
 */
import { create } from "zustand"
import { type GitChange, gitStatus } from "./api"

/** How a path is decorated. `staged` is deliberately not distinguished here —
 *  the tree says "this differs from HEAD", the Source Control view is where the
 *  staged/unstaged split belongs. */
export type FileStatus = GitChange["status"]

/** Single-letter badge + colour per change category. Shared by Source Control
 *  and the file tree, so the same change never reads two different ways. */
export const STATUS: Record<FileStatus, { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--syn-number)" },
  added: { letter: "A", color: "var(--syn-string)" },
  deleted: { letter: "D", color: "var(--marker)" },
  renamed: { letter: "R", color: "var(--syn-keyword)" },
  untracked: { letter: "U", color: "var(--text-faint)" },
  conflicted: { letter: "!", color: "var(--diag-error)" },
}

interface GitStatusState {
  /** Project-relative path → status. Renames key on the new path, as git reports. */
  byPath: Record<string, FileStatus>
  changes: GitChange[]
  refresh: (root: string) => Promise<void>
  clear: () => void
}

export const useGitStatus = create<GitStatusState>((set) => ({
  byPath: {},
  changes: [],
  refresh: async (root) => {
    try {
      const changes = await gitStatus(root)
      const byPath: Record<string, FileStatus> = {}
      // A path can appear twice (staged *and* unstaged edits). Either entry says
      // the same thing for a decoration, so first one wins.
      for (const c of changes) {
        const path = c.path.replace(/\\/g, "/")
        if (!byPath[path]) byPath[path] = c.status
      }
      set({ changes, byPath })
    } catch {
      // Not a repo, or git isn't there. No decorations is the honest answer;
      // keeping stale ones would mark files that are no longer changed.
      set({ changes: [], byPath: {} })
    }
  },
  clear: () => set({ changes: [], byPath: {} }),
}))

/** Does anything under `dir/` differ from HEAD? Used to mark folder rows, so a
 *  change is visible without expanding every level to find it. */
export function folderHasChanges(byPath: Record<string, FileStatus>, dirRel: string): boolean {
  const prefix = `${dirRel}/`
  for (const p in byPath) if (p.startsWith(prefix)) return true
  return false
}
