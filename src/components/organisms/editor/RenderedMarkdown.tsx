import { memo, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import { markdownRehypeFor, markdownRemark, markdownUrlTransform } from "@/lib/markdown"
import { useProjectAssets } from "@/lib/projectAssets"

/** Rendered markdown preview, memoized so it only re-parses when the document
 *  text (or reading width) changes — react-markdown parses synchronously, so an
 *  unmemoized re-render on every unrelated store change froze the UI on large
 *  READMEs (the parse can block the main thread for seconds).
 *
 *  `root`/`baseDir` let a README show its own images: relative `src`s are
 *  rewritten to `asset:` URLs, which the backend must first allow for the root —
 *  so the document waits for that grant (milliseconds) instead of requesting
 *  images the scope would refuse. */
export const RenderedMarkdown = memo(function RenderedMarkdown({
  text,
  root,
  baseDir,
}: {
  text: string
  root?: string
  baseDir?: string
}) {
  const assetsReady = useProjectAssets(root)
  const rehypePlugins = useMemo(() => markdownRehypeFor(baseDir), [baseDir])

  return (
    // Rendered prose keeps a comfortable measure — long prose lines read badly
    // regardless (this is typography, not the old code reading-width toggle).
    <div className="prose-reado mx-auto h-full w-full max-w-[72ch] overflow-y-auto p-8">
      {assetsReady && (
        <ReactMarkdown
          remarkPlugins={markdownRemark}
          rehypePlugins={rehypePlugins}
          urlTransform={markdownUrlTransform}
        >
          {text}
        </ReactMarkdown>
      )}
    </div>
  )
})
