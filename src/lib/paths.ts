/** The separator a path uses: a backslash if it has any, else a forward slash. */
export const pathSep = (p: string) => (p.includes("\\") ? "\\" : "/")

/**
 * The directory a path sits in, on either separator; `""` for a bare name or a
 * root-level entry (`/a`). Nothing is normalized — the result is a prefix of `p`.
 */
export const dirName = (p: string) => {
  const i = p.lastIndexOf(pathSep(p))
  return i > 0 ? p.slice(0, i) : ""
}
