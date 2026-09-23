/** The project's Markdown documents, as the docs view and the knowledge graph list them. */
import { useEffect, useState } from "react"
import { docLinks, listFiles } from "./api"
import { type DocItem, listDocs } from "./knowledge"

/** A document's label without its Markdown extension. */
export const stripDocExt = (s: string) => s.replace(/\.(md|markdown|mdx)$/i, "")

/**
 * The docs under `root`, listed once per root — and, with `links`, the links
 * they make to each other: one backend call for all of them, rather than
 * reading a hundred files over IPC.
 */
export function useDocs(root: string, { links: withLinks = false } = {}) {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [links, setLinks] = useState<Array<[string, string]>>([])
  useEffect(() => {
    let live = true
    listFiles(root)
      .then(async (files) => {
        if (!live) return
        setDocs(listDocs(files))
        if (!withLinks) return
        const paths = files.filter((f) => /\.(md|markdown|mdx)$/i.test(f.replace(/\\/g, "/")))
        const edges = await docLinks(root, paths).catch(() => [])
        if (live) setLinks(edges)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [root, withLinks])
  return { docs, links }
}
