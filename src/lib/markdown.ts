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
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Options } from "react-markdown";
// KaTeX styles + fonts (bundled from 'self', so the desktop CSP allows them).
import "katex/dist/katex.min.css";

const attrs = defaultSchema.attributes ?? {};
const schema = {
  ...defaultSchema,
  attributes: {
    ...attrs,
    "*": [...(attrs["*"] ?? []), "className", "align", "width", "height"],
    img: [...(attrs.img ?? []), "width", "height", "align"],
    div: [...(attrs.div ?? []), "align"],
    p: [...(attrs.p ?? []), "align"],
  },
};

/** Remark plugins: GitHub-flavoured markdown + `$…$`/`$$…$$` math parsing. */
export const markdownRemark: Options["remarkPlugins"] = [remarkGfm, remarkMath];

/** Rehype plugins for rendering untrusted markdown with faithful, safe HTML.
 *  `rehype-katex` runs *after* sanitize: the `<span class="math">` placeholders
 *  survive sanitizing (className is allowed), then KaTeX renders them from the
 *  TeX source — its own output needn't be re-sanitized as it isn't user HTML. */
export const markdownRehype: Options["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, schema],
  rehypeKatex,
];
