/**
 * JSON with comments — what extension manifests, themes, snippets and grammars
 * are actually written in. A module of its own, with nothing to import: reading a
 * snippet file must not pull in the theme and marketplace machinery just to parse.
 */

/**
 * Parse the JSON-with-comments these files are actually written in.
 *
 * The format is nominally JSON; in practice published themes carry `//`
 * comments, block comments and trailing commas, and a strict parse rejects a
 * large share of the registry. Strings are stepped over character by character
 * so a `//` inside a colour name or a URL survives.
 */
export function parseJsonc(text: string): unknown {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      const start = i++
      while (i < text.length && (text[i] !== '"' || text[i - 1] === "\\")) i++
      out += text.slice(start, ++i)
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  // Trailing commas, once the comments that could hide them are gone.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}
