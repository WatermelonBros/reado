/**
 * Shared rehype pipeline for rendering README / doc markdown that contains raw
 * HTML (centered blocks, sized images, shields.io badges, <details> sections).
 *
 * `rehype-raw` turns embedded HTML into real nodes; `rehype-sanitize` then strips
 * anything dangerous (scripts, event handlers, javascript: URLs) while KEEPING the
 * presentational HTML READMEs rely on — the default schema is too strict and drops
 * common attributes like `align`/`width`/`height`, so we extend it. The desktop
 * CSP (`script-src 'self'`) is the hard backstop; this keeps rendering faithful.
 */
import { convertFileSrc } from "@tauri-apps/api/core"
import type { Options } from "react-markdown"
import { defaultUrlTransform } from "react-markdown"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
// KaTeX styles + fonts (bundled from 'self', so the desktop CSP allows them).
import "katex/dist/katex.min.css"

const attrs = defaultSchema.attributes ?? {}
const schema = {
  ...defaultSchema,
  attributes: {
    ...attrs,
    "*": [...(attrs["*"] ?? []), "className", "align", "width", "height"],
    img: [...(attrs.img ?? []), "width", "height", "align"],
    div: [...(attrs.div ?? []), "align"],
    p: [...(attrs.p ?? []), "align"],
  },
}

/** Remark plugins: GitHub-flavoured markdown + `$…$`/`$$…$$` math parsing. */
export const markdownRemark: Options["remarkPlugins"] = [remarkGfm, remarkMath]

/** Rehype plugins for rendering untrusted markdown with faithful, safe HTML.
 *  `rehype-katex` runs *after* sanitize: the `<span class="math">` placeholders
 *  survive sanitizing (className is allowed), then KaTeX renders them from the
 *  TeX source — its own output needn't be re-sanitized as it isn't user HTML. */
export const markdownRehype: Options["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, schema],
  rehypeKatex,
]

/** Resolve a relative markdown link against the document's own directory,
 *  collapsing `.` and `..` without touching the filesystem. */
function resolveFrom(baseDir: string, rel: string): string {
  const base = baseDir.replace(/\\/g, "/").replace(/\/+$/, "")
  const out: string[] = []
  for (const part of `${base}/${rel}`.split("/")) {
    if (part === "..") out.pop()
    else if (part !== "." && (part !== "" || out.length === 0)) out.push(part)
  }
  return out.join("/")
}

/** The slice of a hast node this rewrite touches (the tree itself is `unknown`). */
interface HastNode {
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** Point a README's own images (`![](docs/media/demo.gif)`) at the file on disk.
 *  The webview would otherwise resolve them against its own origin and 404, so
 *  each relative `src` becomes an `asset:` URL — which only loads for
 *  directories granted via `allowProjectAssets`. Runs *after* sanitize, whose
 *  schema would strip the rewritten protocol. */
function rehypeLocalImages(baseDir: string) {
  return () => (tree: unknown) => {
    const visit = (node: HastNode) => {
      if (node?.tagName === "img" && typeof node.properties?.src === "string") {
        const src: string = node.properties.src
        const external =
          /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("#")
        if (!external) {
          const clean = src.split(/[?#]/)[0]
          try {
            node.properties.src = convertFileSrc(resolveFrom(baseDir, decodeURI(clean)))
          } catch {
            /* leave the original src if it isn't decodable */
          }
        }
      }
      for (const child of node?.children ?? []) visit(child)
    }
    visit(tree as HastNode)
  }
}

/** Rehype pipeline for a markdown file that lives at `baseDir`, so its own
 *  relative images resolve. Falls back to the plain pipeline without one. */
export function markdownRehypeFor(baseDir?: string): Options["rehypePlugins"] {
  if (!baseDir) return markdownRehype
  return [rehypeRaw, [rehypeSanitize, schema], rehypeKatex, rehypeLocalImages(baseDir)]
}

/** react-markdown re-sanitises every URL *after* the rehype pipeline, and its
 *  default only trusts http/https/mailto/… — which silently blanks the `asset:`
 *  URLs the image rewrite just produced (the image then renders as its alt
 *  text). Let those through; everything else keeps the default treatment.
 *
 *  Only macOS/Linux need this: on Windows `convertFileSrc` yields
 *  `http://asset.localhost/…`, which the default already allows. */
export const markdownUrlTransform: NonNullable<Options["urlTransform"]> = (url) =>
  url.startsWith("asset://") ? url : defaultUrlTransform(url)
