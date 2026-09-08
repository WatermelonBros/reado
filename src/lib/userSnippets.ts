/**
 * Snippets the *project* ships, in `.reado/snippets.json`.
 *
 * The format is VS Code's `.code-snippets` file verbatim — a flat object of
 * named snippets, each with a `prefix`, a `body` and an optional `scope` — so a
 * team can keep one file that both editors read, and so the snippets travel
 * through git with the code they belong to rather than living on one machine.
 *
 * Bodies go through the same translator as extension snippets, so `${1:name}`,
 * `$0` and the editor variables mean here exactly what they mean there.
 */
import { type Completion, snippetCompletion } from "@codemirror/autocomplete"
import { readReadoFile } from "./api"
import { type SnippetContext, toTemplate } from "./extSnippets"
import { createLogger, safeError } from "./logger"

const log = createLogger("userSnippets")

/** The file a project puts its shared snippets in. */
export const SNIPPETS_FILE = "snippets.json"

interface RawSnippet {
  prefix?: string | string[]
  body?: string | string[]
  description?: string
  /** Comma-separated language ids, as in VS Code. Absent means every language. */
  scope?: string
}

/** Parse a snippets file into completions for `languageId`. Malformed entries
 *  are skipped rather than failing the file: one bad snippet must not cost the
 *  project the other twenty. */
export function parseSnippets(json: string, languageId: string, ctx: SnippetContext): Completion[] {
  let raw: Record<string, RawSnippet>
  try {
    raw = JSON.parse(json) as Record<string, RawSnippet>
  } catch (e) {
    log.warn("malformed snippets.json, ignoring", { error: safeError(e) })
    return []
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []

  const out: Completion[] = []
  for (const [label, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue
    const scopes = (entry.scope ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (scopes.length > 0 && !scopes.includes(languageId)) continue
    const body = Array.isArray(entry.body) ? entry.body.join("\n") : entry.body
    if (typeof body !== "string" || !body) continue
    const prefixes = Array.isArray(entry.prefix)
      ? entry.prefix
      : entry.prefix
        ? [entry.prefix]
        : [label]
    for (const prefix of prefixes) {
      if (typeof prefix !== "string" || !prefix) continue
      out.push(
        snippetCompletion(toTemplate(body, ctx), {
          label: prefix,
          detail: entry.description ?? label,
          type: "text",
        }),
      )
    }
  }
  return out
}

/**
 * The open project's snippets, cached per project root.
 *
 * Read once and kept: this is on the completion path, and a disk read per
 * keystroke would be felt. `invalidateSnippets` drops the cache when the file
 * changes on disk.
 */
const cache = new Map<string, Promise<string | null>>()

export function invalidateSnippets(root?: string): void {
  if (root) cache.delete(root)
  else cache.clear()
}

export async function projectSnippets(
  root: string,
  languageId: string,
  ctx: SnippetContext,
): Promise<Completion[]> {
  if (!root) return []
  let pending = cache.get(root)
  if (!pending) {
    pending = readReadoFile(root, SNIPPETS_FILE).catch(() => null)
    cache.set(root, pending)
  }
  const json = await pending
  return json ? parseSnippets(json, languageId, ctx) : []
}
