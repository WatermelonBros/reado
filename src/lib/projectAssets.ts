/**
 * The `asset:` scope grant a markdown preview needs before it shows a document's
 * own images (`![](docs/media/demo.gif)` → a file on disk).
 *
 * The grant has to *land before* the images are requested: an `<img>` the scope
 * refuses is not retried, so rendering first and granting in an effect showed a
 * README without its images until the file was reopened. One grant per root,
 * shared by every preview.
 */
import { useEffect, useState } from "react"
import { allowProjectAssets } from "@/lib/api"

const grants = new Map<string, Promise<void>>()
const settled = new Set<string>()

/** Allow `root`'s files in the asset scope; resolves once they load (or the grant failed). */
export function grantProjectAssets(root: string): Promise<void> {
  let p = grants.get(root)
  if (!p) {
    p = allowProjectAssets(root).then(
      () => void settled.add(root),
      () => void grants.delete(root), // not granted: let the next preview ask again
    )
    grants.set(root, p)
  }
  return p
}

/** Whether a preview of `root`'s documents may render its images yet. With no
 *  root there is nothing to wait for; a failed grant still renders (the text
 *  matters more than the pictures). */
export function useProjectAssets(root?: string): boolean {
  const [ready, setReady] = useState(() => !root || settled.has(root))
  useEffect(() => {
    if (!root || settled.has(root)) {
      setReady(true)
      return
    }
    setReady(false)
    let live = true
    void grantProjectAssets(root).then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [root])
  return ready
}
