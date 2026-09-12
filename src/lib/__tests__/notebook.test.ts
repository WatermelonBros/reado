// The .ipynb parser. Notebooks in the wild disagree with the spec and with each
// other — source as a string or a list of lines, cells with no id, outputs with
// several representations of the same value — so what is pinned here is the
// handling of the shapes that actually turn up, and the refusal to throw on the
// ones that don't.
import { describe, expect, it } from "vitest"

import { isNotebook, parseNotebook } from "@/lib/notebook"

const nb = (cells: unknown[], metadata: unknown = {}) =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata, cells })

describe("parsing a notebook", () => {
  it("joins source given as a list of lines, and takes it as-is when it is a string", () => {
    const doc = parseNotebook(
      nb([
        { cell_type: "code", source: ["import os\n", "print(os.name)\n"], outputs: [] },
        { cell_type: "markdown", source: "# Title" },
      ]),
    )
    expect(doc?.cells[0].source).toBe("import os\nprint(os.name)\n")
    expect(doc?.cells[1].source).toBe("# Title")
    expect(doc?.cells[1].type).toBe("markdown")
  })

  it("falls back to the index for a cell with no id", () => {
    const doc = parseNotebook(nb([{ cell_type: "code" }, { cell_type: "code", id: "abc" }]))
    expect(doc?.cells.map((c) => c.id)).toEqual(["cell-0", "abc"])
  })

  it("keeps the execution number, including its absence", () => {
    const doc = parseNotebook(
      nb([
        { cell_type: "code", execution_count: 3 },
        { cell_type: "code", execution_count: null },
      ]),
    )
    expect(doc?.cells.map((c) => c.executionCount)).toEqual([3, null])
  })

  it("prefers a figure to its text repr, and HTML to plain text", () => {
    const doc = parseNotebook(
      nb([
        {
          cell_type: "code",
          outputs: [
            {
              output_type: "display_data",
              data: { "text/plain": "<Figure size 640x480>", "image/png": "iVBORw0K" },
            },
            {
              output_type: "execute_result",
              data: { "text/plain": "  a  b", "text/html": "<table><tr><td>a</td></tr></table>" },
            },
          ],
        },
      ]),
    )
    const [figure, table] = doc?.cells[0].outputs ?? []
    expect(figure.kind).toBe("image")
    expect(figure.dataUrl).toBe("data:image/png;base64,iVBORw0K")
    expect(table.kind).toBe("html")
  })

  it("tells stderr from stdout", () => {
    const doc = parseNotebook(
      nb([
        {
          cell_type: "code",
          outputs: [
            { output_type: "stream", name: "stdout", text: ["fine\n"] },
            { output_type: "stream", name: "stderr", text: ["warning\n"] },
          ],
        },
      ]),
    )
    expect(doc?.cells[0].outputs.map((o) => !!o.stderr)).toEqual([false, true])
  })

  it("strips the colour out of a traceback", () => {
    const doc = parseNotebook(
      nb([
        {
          cell_type: "code",
          outputs: [
            {
              output_type: "error",
              ename: "ValueError",
              evalue: "nope",
              traceback: ["\u001b[0;31mValueError\u001b[0m: nope"],
            },
          ],
        },
      ]),
    )
    expect(doc?.cells[0].outputs[0]).toEqual({ kind: "error", text: "ValueError: nope" })
  })

  it("reads the language from either place the kernel writes it", () => {
    expect(parseNotebook(nb([], { language_info: { name: "r" } }))?.language).toBe("r")
    expect(parseNotebook(nb([], { kernelspec: { language: "julia" } }))?.language).toBe("julia")
    // Neither: the overwhelming default, rather than an empty badge.
    expect(parseNotebook(nb([]))?.language).toBe("python")
  })

  it("returns null for anything that is not a notebook, rather than throwing", () => {
    expect(parseNotebook("not json at all")).toBeNull()
    expect(parseNotebook("[]")).toBeNull()
    expect(parseNotebook('{"nbformat": 4}')).toBeNull()
    // A half-written file, which is what a notebook looks like mid-save.
    expect(parseNotebook('{"cells": [{"cell_type": "code"')).toBeNull()
  })

  it("drops an output shape it does not understand instead of rendering nothing", () => {
    const doc = parseNotebook(
      nb([
        {
          cell_type: "code",
          outputs: [{ output_type: "from_the_future" }, { output_type: "stream", text: "ok" }],
        },
      ]),
    )
    expect(doc?.cells[0].outputs).toHaveLength(1)
  })
})

describe("recognising one", () => {
  it("goes by the extension, in any case", () => {
    expect(isNotebook("/p/Analysis.IPYNB")).toBe(true)
    expect(isNotebook("/p/a.ipynb")).toBe(true)
    expect(isNotebook("/p/ipynb.py")).toBe(false)
  })
})
