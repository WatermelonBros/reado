import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { markdownRemark, markdownRehype } from "../../../lib/markdown";

/** Rendered markdown preview, memoized so it only re-parses when the document
 *  text (or reading width) changes — react-markdown parses synchronously, so an
 *  unmemoized re-render on every unrelated store change froze the UI on large
 *  READMEs (the parse can block the main thread for seconds). */
export const RenderedMarkdown = memo(function RenderedMarkdown({ text }: { text: string }) {
  return (
    // Rendered prose keeps a comfortable measure — long prose lines read badly
    // regardless (this is typography, not the old code reading-width toggle).
    <div className="prose-reado mx-auto h-full w-full max-w-[72ch] overflow-y-auto p-8">

      <ReactMarkdown remarkPlugins={markdownRemark} rehypePlugins={markdownRehype}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
