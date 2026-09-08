// The search results as an editable document. The whole feature rests on the
// row → source mapping staying honest: applying rewrites real files, so a row
// that says "src/a.ts line 12" had better be that line, and a document whose
// shape changed had better apply nothing at all.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ writeLines: vi.fn() }))

import { type SearchMatch, writeLines } from "@/lib/api"
import {
  applyResultEdits,
  buildResultsDoc,
  pendingEdits,
  rowText,
  sameShape,
} from "@/lib/searchResults"
import { useProject } from "@/lib/store"

beforeEach(() => {
  vi.mocked(writeLines).mockReset().mockResolvedValue({ changed: 1, backups: [] })
  // Paths name their own folder now, so the document needs a workspace to
  // resolve them against.
  useProject.setState({ root: ROOT, roots: [ROOT] })
})

const ROOT = "/repo"
const match = (path: string, line: number, text: string): SearchMatch => ({
  path: `${ROOT}/${path}`,
  line,
  column: 1,
  text,
})

const MATCHES = [
  match("src/a.ts", 12, "  const foo = 1"),
  match("src/a.ts", 40, "foo()"),
  match("src/b.ts", 7, "  return foo"),
]

describe("buildResultsDoc", () => {
  it("groups by file, under a relative-path heading", () => {
    const { text } = buildResultsDoc(MATCHES)
    expect(text.split("\n")).toEqual([
      "src/a.ts:",
      " 12    const foo = 1",
      " 40  foo()",
      "",
      "src/b.ts:",
      "  7    return foo",
    ])
  })

  it("maps every row to its source line, and nothing else", () => {
    const { rows } = buildResultsDoc(MATCHES)
    // Headings and the blank separator map to nothing: editing one must never
    // rewrite a file.
    expect(rows[0]).toBeNull()
    expect(rows[3]).toBeNull()
    expect(rows[1]).toEqual({ path: `${ROOT}/src/a.ts`, line: 12 })
    expect(rows[5]).toEqual({ path: `${ROOT}/src/b.ts`, line: 7 })
  })

  it("carries the whole source line, not the trimmed preview", () => {
    // Applying rewrites the whole line, so what you edit has to be that line —
    // including its indentation.
    const { text } = buildResultsDoc([match("a.ts", 1, "    indented")])
    expect(rowText(text.split("\n")[1])).toBe("    indented")
  })

  it("copes with an empty result list", () => {
    expect(buildResultsDoc([])).toEqual({ text: "", rows: [] })
  })
})

describe("pendingEdits", () => {
  const doc = buildResultsDoc(MATCHES)
  const edit = (transform: (lines: string[]) => string[]) =>
    pendingEdits(doc, transform(doc.text.split("\n")).join("\n"))

  it("reports only the rows that changed", () => {
    const out = edit((lines) => lines.map((l, i) => (i === 1 ? " 12    const bar = 1" : l)))
    expect(out).toEqual([{ path: `${ROOT}/src/a.ts`, line: 12, text: "  const bar = 1" }])
  })

  it("strips the line-number prefix, which is structure and not content", () => {
    const out = edit((lines) => lines.map((l, i) => (i === 2 ? " 40  bar()" : l)))
    expect(out[0].text).toBe("bar()")
  })

  it("ignores an edited heading, which maps to no source line", () => {
    expect(edit((lines) => lines.map((l, i) => (i === 0 ? "nonsense:" : l)))).toEqual([])
  })

  it("reports nothing when nothing changed", () => {
    expect(pendingEdits(doc, doc.text)).toEqual([])
  })

  it("applies nothing at all once rows are added or removed", () => {
    // The mapping is positional; a document whose shape changed no longer
    // describes the same matches, and guessing would rewrite the wrong lines.
    expect(edit((lines) => [...lines, "extra"])).toEqual([])
    expect(edit((lines) => lines.slice(1))).toEqual([])
    expect(sameShape(doc, `${doc.text}\nextra`)).toBe(false)
    expect(sameShape(doc, doc.text)).toBe(true)
  })

  it("collects edits across several files", () => {
    const out = edit((lines) => lines.map((l, i) => (i === 1 ? " 12  A" : i === 5 ? "  7  B" : l)))
    expect(out).toEqual([
      { path: `${ROOT}/src/a.ts`, line: 12, text: "A" },
      { path: `${ROOT}/src/b.ts`, line: 7, text: "B" },
    ])
  })
})

describe("rowText", () => {
  it("keeps a line that has no prefix intact", () => {
    expect(rowText("src/a.ts:")).toBe("src/a.ts:")
  })

  it("strips only the prefix, never content that looks like one", () => {
    // "  12  x" is a prefix; "12  x" inside the code is not the prefix.
    expect(rowText(" 12  const n = 12  // note")).toBe("const n = 12  // note")
  })
})

describe("applyResultEdits", () => {
  it("groups the edits by file, so each one is rewritten in a single call", async () => {
    // One write per file, not one per row: a hundred edits in one file must not
    // be a hundred reads and writes of it.
    const calls: Array<[string, string, unknown]> = []
    vi.mocked(writeLines).mockImplementation(async (root, path, edits) => {
      calls.push([root, path, edits])
      return { changed: 1, backups: [{ path, backup: `${path}.bak` }] }
    })
    const { files, backups } = await applyResultEdits([
      { path: "/repo/a.ts", line: 1, text: "A" },
      { path: "/repo/b.ts", line: 7, text: "B" },
      { path: "/repo/a.ts", line: 9, text: "C" },
    ])
    expect(calls).toHaveLength(2)
    expect(calls[0][2]).toEqual([
      { line: 1, text: "A" },
      { line: 9, text: "C" },
    ])
    expect(files).toBe(2)
    // Every backup comes back, so the whole application is one undo.
    expect(backups.map((b) => b.path)).toEqual(["/repo/a.ts", "/repo/b.ts"])
  })

  it("does nothing at all when there is nothing to apply", async () => {
    vi.mocked(writeLines).mockClear()
    await expect(applyResultEdits([])).resolves.toEqual({ files: 0, backups: [] })
    expect(writeLines).not.toHaveBeenCalled()
  })
})
