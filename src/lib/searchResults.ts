/**
 * The search results as an editable document.
 *
 * Replace-all is a blunt instrument and replacing one match at a time is slow;
 * the thing people actually want for a careful rename is to see every hit as
 * text, fix them by hand — skipping the three that shouldn't change — and write
 * the result back. That is what this is.
 *
 * The document is one row per match, prefixed with its line number, grouped
 * under its file. The prefixes are structure, not content: applying reads the
 * text *after* the prefix and rewrites exactly that source line.
 */
import { type Backup, type SearchMatch, writeLines } from "./api"
import { toRelative } from "./comments"
import { rootFor } from "./workspace"

/** Where one row of the document came from. `null` for a heading or a blank. */
export type RowSource = { path: string; line: number } | null

export interface ResultsDoc {
  text: string
  /** One entry per line of `text`, parallel to it. */
  rows: RowSource[]
}

/** How wide the line-number gutter is. Fixed per file so the text lines up. */
const numberWidth = (matches: SearchMatch[]) =>
  Math.max(3, ...matches.map((m) => String(m.line).length))

/** Build the editable document from a result list. */
export function buildResultsDoc(matches: SearchMatch[]): ResultsDoc {
  const byFile = new Map<string, SearchMatch[]>()
  for (const m of matches) {
    const list = byFile.get(m.path)
    if (list) list.push(m)
    else byFile.set(m.path, [m])
  }

  const lines: string[] = []
  const rows: RowSource[] = []
  for (const [path, hits] of byFile) {
    if (lines.length > 0) {
      lines.push("")
      rows.push(null)
    }
    lines.push(`${toRelative(rootFor(path), path)}:`)
    rows.push(null)
    const width = numberWidth(hits)
    for (const hit of hits) {
      // The raw line, not the trimmed preview: applying rewrites the whole
      // source line, so what you edit has to be the whole source line.
      lines.push(`${String(hit.line).padStart(width)}  ${hit.text}`)
      rows.push({ path: hit.path, line: hit.line })
    }
  }
  return { text: lines.join("\n"), rows }
}

/** The text of a row, with its line-number prefix stripped. */
export function rowText(line: string): string {
  return line.replace(/^\s*\d+ {2}/, "")
}

export interface PendingEdit {
  path: string
  line: number
  text: string
}

/**
 * The edits an edited document implies.
 *
 * Compares row by row against the document it was built from, so a row left
 * alone is not rewritten — applying must touch only what the reader changed.
 * Rows added or removed are ignored: the mapping is positional, and a document
 * whose shape changed no longer describes the same matches.
 */
export function pendingEdits(original: ResultsDoc, edited: string): PendingEdit[] {
  const before = original.text.split("\n")
  const after = edited.split("\n")
  if (before.length !== after.length) return []
  const out: PendingEdit[] = []
  for (let i = 0; i < after.length; i++) {
    const source = original.rows[i]
    if (!source || after[i] === before[i]) continue
    out.push({ path: source.path, line: source.line, text: rowText(after[i]) })
  }
  return out
}

/** Whether the document still has the shape it was built with. */
export const sameShape = (original: ResultsDoc, edited: string) =>
  original.text.split("\n").length === edited.split("\n").length

/**
 * Write the edits back, one call per file.
 *
 * Returns the backups so the whole application lands on the undo stack as a
 * single action — the same guarantee Replace All gives.
 */
export async function applyResultEdits(
  edits: PendingEdit[],
): Promise<{ files: number; backups: Backup[] }> {
  // Push, don't rebuild: copying the accumulator per element made grouping a
  // few thousand hits quadratic.
  const byFile = new Map<string, PendingEdit[]>()
  for (const e of edits) {
    const list = byFile.get(e.path)
    if (list) list.push(e)
    else byFile.set(e.path, [e])
  }

  const backups: Backup[] = []
  let files = 0
  for (const [path, list] of byFile) {
    // The folder that owns the file — search spans the workspace, so a result
    // is as likely to be in the second folder as the first.
    const res = await writeLines(
      rootFor(path),
      path,
      list.map((e) => ({ line: e.line, text: e.text })),
    )
    backups.push(...res.backups)
    files += res.changed
  }
  return { files, backups }
}
