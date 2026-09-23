/**
 * The project's full file list (rel paths, "/"-separated), cached so each folder
 * row can show a quiet read/total aggregate without re-walking the disk, and so
 * every panel that needs the list shares one copy.
 */
import { useEffect } from "react"
import { create } from "zustand"
import { listFiles } from "./api"
import { createLogger, safeError } from "./logger"
import { useProject } from "./store"

const log = createLogger("projectFiles")

/** The root the newest `load` asked for; an older answer arriving late is dropped. */
let requested: string | null = null

export const useProjectFiles = create<{
  /** The root `files` was listed for; null until the first list lands. */
  root: string | null
  files: string[]
  load: (root: string) => void
}>((set, get) => ({
  root: null,
  files: [],
  load: (root) => {
    requested = root
    void listFiles(root)
      .then((fs) => {
        if (requested === root) set({ root, files: fs.map((f) => f.replace(/\\/g, "/")) })
      })
      // A transient failure keeps the cached list — wiping it to [] would flicker
      // away the per-folder read/total badges. Stale beats empty here. A root
      // that has never listed has nothing stale to keep, so it lists as empty.
      .catch((e) => {
        log.warn("list files failed", { error: safeError(e) })
        if (requested === root && get().root !== root) set({ root, files: [] })
      })
  },
}))

/**
 * The file list for `root`, re-listed whenever the tree changes (`treeNonce`: a
 * save, a delete, an agent writing files). Null until it has been listed once.
 */
export function useProjectFileList(root: string): string[] | null {
  const treeNonce = useProject((s) => s.treeNonce)
  useEffect(() => {
    if (root) useProjectFiles.getState().load(root)
  }, [root, treeNonce])
  return useProjectFiles((s) => (s.root === root ? s.files : null))
}
