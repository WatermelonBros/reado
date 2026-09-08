// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${capture}` placeholder is data in a rule string, not an interpolation
/**
 * File nesting: `package-lock.json` tucked under `package.json`, `a.js` and
 * `a.d.ts` under `a.ts`.
 *
 * The tree lists what is on disk, and on disk a generated sibling looks exactly
 * as important as the file that generated it. Nesting is how a JS/TS project
 * stops being mostly noise — which is worth more in a read-first editor than in
 * one where you spend the day typing.
 *
 * Rules are written the way VS Code writes them, `parent : child, child`, with
 * `${capture}` standing for whatever the parent's `*` matched:
 *
 *     *.ts : ${capture}.js, ${capture}.d.ts, ${capture}.js.map
 *     package.json : package-lock.json, pnpm-lock.yaml
 */
import type { DirEntry } from "./api"

export interface NestingRule {
  /** The parent pattern, e.g. `*.ts`. At most one `*`. */
  parent: string
  /** The child patterns, e.g. `${capture}.js`. */
  children: string[]
}

/**
 * What Reado ships with.
 *
 * Deliberately conservative: only pairs where the child is *derived from* the
 * parent, never merely related to it. A rule that hides a file someone might
 * edit is worse than no rule.
 */
export const DEFAULT_NESTING = [
  "*.ts : ${capture}.js, ${capture}.d.ts, ${capture}.js.map, ${capture}.d.ts.map",
  "*.tsx : ${capture}.js, ${capture}.jsx",
  "*.js : ${capture}.js.map, ${capture}.min.js",
  "*.jsx : ${capture}.js",
  "*.css : ${capture}.css.map, ${capture}.min.css",
  "*.scss : ${capture}.css, ${capture}.css.map",
  "package.json : package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb, .npmrc, .nvmrc",
  "Cargo.toml : Cargo.lock",
  "pyproject.toml : poetry.lock, uv.lock, setup.cfg",
  "go.mod : go.sum",
  "Gemfile : Gemfile.lock",
  "composer.json : composer.lock",
  "*.tf : ${capture}.tfvars, ${capture}.tfstate",
]

/**
 * The rules in force, parsed once per distinct rule list.
 *
 * Every folder listing needs them on every render; re-parsing the thirteen
 * shipped strings each time is pure waste, and the list is a stable reference
 * between settings edits.
 */
let cachedSource: string[] | undefined
let cachedRules: NestingRule[] | undefined
export function nestingRulesFor(userRules: string[]): NestingRule[] {
  const source = userRules.length > 0 ? userRules : DEFAULT_NESTING
  if (cachedRules && cachedSource === source) return cachedRules
  cachedSource = source
  cachedRules = parseNestingRules(source)
  return cachedRules
}

/** Parse the `parent : child, child` lines into rules, skipping malformed ones. */
export function parseNestingRules(lines: string[]): NestingRule[] {
  const rules: NestingRule[] = []
  for (const line of lines) {
    const [parent, rest] = line.split(":", 2)
    if (!parent || !rest) continue
    const children = rest
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
    if (children.length > 0) rules.push({ parent: parent.trim(), children })
  }
  return rules
}

/** What the parent pattern's `*` matched in `name`, or null when it doesn't. */
function capture(pattern: string, name: string): string | null {
  const star = pattern.indexOf("*")
  if (star < 0) return pattern === name ? "" : null
  const before = pattern.slice(0, star)
  const after = pattern.slice(star + 1)
  if (!name.startsWith(before) || !name.endsWith(after)) return null
  if (name.length < before.length + after.length) return null
  return name.slice(before.length, name.length - after.length)
}

export interface NestedEntry {
  entry: DirEntry
  /** Files tucked under it, in the order the folder listed them. */
  children: DirEntry[]
}

/**
 * Group one folder's entries into parents and the files nested under them.
 *
 * Only files nest, and only within the same folder — a rule reaching across
 * directories would hide a file somewhere you weren't looking. A file that
 * matches two parents goes to the first that claims it, so the result is always
 * a list, never a graph.
 */
export function nestEntries(entries: DirEntry[], rules: NestingRule[]): NestedEntry[] {
  if (rules.length === 0) return entries.map((entry) => ({ entry, children: [] }))

  const byName = new Map(entries.filter((e) => !e.isDir).map((e) => [e.name, e]))
  const claimed = new Set<string>()
  const childrenOf = new Map<string, DirEntry[]>()

  for (const parent of entries) {
    if (parent.isDir || claimed.has(parent.name)) continue
    for (const rule of rules) {
      const stem = capture(rule.parent, parent.name)
      if (stem === null) continue
      for (const pattern of rule.children) {
        const childName = pattern.split("${capture}").join(stem)
        // A file never nests under itself, and never under something already
        // nested — otherwise `a.js` under `a.ts` could adopt `a.js.map` in one
        // pass and lose it in the next, depending on listing order.
        if (childName === parent.name || claimed.has(childName)) continue
        const child = byName.get(childName)
        if (!child) continue
        claimed.add(childName)
        // Push, don't rebuild: copying the accumulator per child made this
        // quadratic in a folder with many nested files.
        const kids = childrenOf.get(parent.name)
        if (kids) kids.push(child)
        else childrenOf.set(parent.name, [child])
      }
    }
  }

  return entries
    .filter((e) => !claimed.has(e.name) || e.isDir)
    .map((entry) => ({ entry, children: childrenOf.get(entry.name) ?? [] }))
}
