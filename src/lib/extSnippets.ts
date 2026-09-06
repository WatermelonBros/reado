/**
 * Snippets contributed by installed extensions.
 *
 * The published format and CodeMirror's own snippet syntax agree on the part
 * that matters — `${1:placeholder}` and `${0}` mean the same thing in both, and
 * both honour the numbering rather than textual order. What they disagree on is
 * the tail: bare `$1`, choice fields, transforms and editor variables. Those are
 * translated where they have a meaning here and removed where they don't, so a
 * snippet never leaves raw placeholder syntax in the document.
 */
import { type Completion, snippetCompletion } from "@codemirror/autocomplete"
import { extRead, type InstalledExt } from "./api"
import { createLogger } from "./logger"

const log = createLogger("extSnippets")

/** One snippet, as published. */
interface SnippetEntry {
  prefix?: string | string[]
  body?: string | string[]
  description?: string
}

interface SnippetContribution {
  language?: string
  path?: string
}

/** Variables Reado can answer. Anything else is dropped rather than inserted —
 *  a literal `$TM_SELECTED_TEXT` in the document is worse than nothing. */
function variableValue(name: string, ctx: SnippetContext): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  switch (name) {
    case "TM_FILENAME":
      return ctx.fileName
    case "TM_FILENAME_BASE":
      return ctx.fileName.replace(/\.[^.]+$/, "")
    case "TM_DIRECTORY":
      return ctx.directory
    case "CURRENT_YEAR":
      return String(now.getFullYear())
    case "CURRENT_MONTH":
      return pad(now.getMonth() + 1)
    case "CURRENT_DATE":
      return pad(now.getDate())
    default:
      return ""
  }
}

export interface SnippetContext {
  fileName: string
  directory: string
}

/**
 * Translate one published snippet body into a CodeMirror template.
 *
 * Scans `${…}` with balanced braces rather than a regular expression, because
 * placeholders nest (`${1:${2:inner}}`) and a regex either stops at the first
 * `}` or swallows the rest of the line.
 */
export function toTemplate(body: string, ctx: SnippetContext): string {
  let out = ""
  let i = 0
  while (i < body.length) {
    const c = body[i]
    if (c === "\\" && (body[i + 1] === "$" || body[i + 1] === "\\")) {
      out += body[i + 1]
      i += 2
      continue
    }
    if (c !== "$") {
      out += c
      i++
      continue
    }
    // `$1`, `$0`, `$TM_FILENAME`
    const bare = /^\$(\d+|[A-Za-z_][A-Za-z0-9_]*)/.exec(body.slice(i))
    if (bare && body[i + 1] !== "{") {
      out += /^\d+$/.test(bare[1]) ? `\${${bare[1]}}` : variableValue(bare[1], ctx)
      i += bare[0].length
      continue
    }
    if (body[i + 1] !== "{") {
      out += c
      i++
      continue
    }
    // `${…}` — find its matching brace.
    let depth = 0
    let end = i + 1
    for (; end < body.length; end++) {
      if (body[end] === "{") depth++
      else if (body[end] === "}" && --depth === 0) break
    }
    const inner = body.slice(i + 2, end)
    out += translateField(inner, ctx)
    i = end + 1
  }
  return out
}

/** The inside of a `${…}`, translated. */
function translateField(inner: string, ctx: SnippetContext): string {
  // A choice — `1|a,b,c|` — has no editor affordance here, so it becomes its
  // first option as the placeholder's default.
  const choice = /^(\d+)\|(.*)\|$/s.exec(inner)
  if (choice) return `\${${choice[1]}:${choice[2].split(",")[0]}}`

  // A transform — `1/regex/replacement/flags` — is dropped to a plain field.
  const transform = /^(\d+)\//.exec(inner)
  if (transform) return `\${${transform[1]}}`

  const placeholder = /^(\d+):([\s\S]*)$/.exec(inner)
  if (placeholder) {
    // Nested defaults are flattened: the inner placeholder's text is all that
    // can survive as a single field's default.
    const text = toTemplate(placeholder[2], ctx).replace(/\$\{\d+:?([^}]*)\}/g, "$1")
    // Braces inside a default would end the field early; escape them.
    return `\${${placeholder[1]}:${text.replace(/[{}]/g, "\\$&")}}`
  }
  if (/^\d+$/.test(inner)) return `\${${inner}}`

  // A variable, with or without a default (`TM_FILENAME:untitled`).
  const [name, fallback] = inner.split(/:(.*)/s)
  return variableValue(name, ctx) || (fallback ?? "")
}

/** The snippet contributions of an installed extension, for `languageId`. */
function contributionsFor(ext: InstalledExt, languageId: string): SnippetContribution[] {
  const list = (ext.manifest.contributes?.snippets as SnippetContribution[] | undefined) ?? []
  return list.filter((s) => s.path && s.language === languageId)
}

/** Snippet files, parsed once per extension file. */
const cache = new Map<string, Record<string, SnippetEntry>>()

async function readSnippetFile(
  ext: InstalledExt,
  path: string,
): Promise<Record<string, SnippetEntry>> {
  const key = `${ext.id}:${path}`
  const hit = cache.get(key)
  if (hit) return hit
  // Snippet files carry comments as often as themes do.
  const { parseJsonc } = await import("./extThemes")
  const parsed = parseJsonc(await extRead(ext.namespace, ext.name, path)) as Record<
    string,
    SnippetEntry
  >
  cache.set(key, parsed)
  return parsed
}

/** Every contributed snippet for `languageId`, as CodeMirror completions. */
export async function snippetsFor(
  installed: InstalledExt[],
  languageId: string,
  ctx: SnippetContext,
): Promise<Completion[]> {
  const out: Completion[] = []
  for (const ext of installed) {
    for (const contribution of contributionsFor(ext, languageId)) {
      try {
        const entries = await readSnippetFile(ext, contribution.path as string)
        for (const [name, entry] of Object.entries(entries)) {
          const body = Array.isArray(entry.body) ? entry.body.join("\n") : entry.body
          if (!body) continue
          const prefixes = Array.isArray(entry.prefix)
            ? entry.prefix
            : entry.prefix
              ? [entry.prefix]
              : [name]
          const template = toTemplate(body, ctx)
          for (const prefix of prefixes) {
            out.push(
              snippetCompletion(template, {
                label: prefix,
                detail: entry.description ?? name,
                type: "snippet",
              }),
            )
          }
        }
      } catch (e) {
        log.warn("could not read a snippet file", { id: ext.id, error: String(e) })
      }
    }
  }
  return out
}

/** Whether any installed extension has snippets for this language — checked
 *  before the editor turns completion on at all, so a project with no snippet
 *  extensions behaves exactly as it did before. */
export const hasSnippets = (installed: InstalledExt[], languageId: string) =>
  installed.some((ext) => contributionsFor(ext, languageId).length > 0)
