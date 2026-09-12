/**
 * Reading a Jupyter notebook: `.ipynb` is JSON, and JSON is not what anyone
 * opened it to look at.
 *
 * This turns the file into the thing on the page — an ordered list of cells,
 * each with its source, and for a code cell the outputs it was last saved with:
 * the printed text, the returned value, the figure, the traceback. Those outputs
 * are stored *in* the file, so a notebook shows its plots without anything
 * running.
 *
 * ponytail: reading only, and nbformat 4 only (v3's `worksheets` shape is a
 * decade old and a separate parser). Executing a cell means speaking the Jupyter
 * kernel protocol — five ZeroMQ sockets and an HMAC — which is a subsystem, not
 * a function; the editor offers `nbconvert --execute` for the whole notebook
 * instead, and editing goes through the source view.
 */

/** One rendered piece of a code cell's result. */
export interface NbOutput {
  /** `stream` is stdout/stderr, `text` a returned value, `html` a rich repr,
   *  `image` a figure, `error` a traceback. */
  kind: "stream" | "text" | "html" | "image" | "error"
  /** The text of everything but an image. */
  text?: string
  /** `data:` URL for an image output. */
  dataUrl?: string
  /** stderr, so it can be told apart from stdout. */
  stderr?: boolean
}

export interface NbCell {
  /** Stable within the notebook — the file's own id where it has one, its index
   *  otherwise (nbformat only required ids from 4.5). */
  id: string
  type: "code" | "markdown" | "raw"
  source: string
  /** `[3]` beside a code cell; null for one that has not run. */
  executionCount: number | null
  outputs: NbOutput[]
}

export interface Notebook {
  /** For the code cells' label — `python`, `r`, whatever the kernel was. */
  language: string
  cells: NbCell[]
}

/** nbformat stores text as a string or as a list of lines that already end in
 *  newlines. Both mean one string. */
const joined = (v: unknown): string =>
  Array.isArray(v) ? v.map(String).join("") : typeof v === "string" ? v : ""

/** Strip the ANSI a traceback is coloured with — it is written for a terminal,
 *  and this is not one. */
const stripAnsi = (s: string): string =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
  s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")

/** The image mime types a notebook may carry, richest first. */
const IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const

function readOutput(raw: Record<string, unknown>): NbOutput | null {
  const type = raw.output_type
  if (type === "stream") {
    return {
      kind: "stream",
      text: joined(raw.text),
      stderr: raw.name === "stderr",
    }
  }
  if (type === "error") {
    const traceback = Array.isArray(raw.traceback) ? raw.traceback.map(String).join("\n") : ""
    return {
      kind: "error",
      text: stripAnsi(traceback || `${raw.ename}: ${raw.evalue}`),
    }
  }
  if (type === "execute_result" || type === "display_data") {
    const data = (raw.data ?? {}) as Record<string, unknown>
    // Richest first: a figure beats its "<Figure size 640x480>" repr, and an
    // HTML table beats the same table redrawn in spaces.
    for (const mime of IMAGES) {
      const payload = data[mime]
      if (typeof payload === "string" && payload.length > 0)
        return { kind: "image", dataUrl: `data:${mime};base64,${payload.replace(/\s+/g, "")}` }
    }
    if (data["image/svg+xml"] !== undefined)
      return { kind: "html", text: joined(data["image/svg+xml"]) }
    if (data["text/html"] !== undefined) return { kind: "html", text: joined(data["text/html"]) }
    if (data["text/markdown"] !== undefined)
      return { kind: "html", text: joined(data["text/markdown"]) }
    if (data["text/plain"] !== undefined) return { kind: "text", text: joined(data["text/plain"]) }
  }
  return null
}

/**
 * Parse a notebook, or return null for anything that is not one.
 *
 * Null rather than a throw: the caller's answer to "this is not a notebook" is
 * to show the file as text, which is not an error state — a half-written
 * `.ipynb` and a `.ipynb` that is really something else both end up there.
 */
export function parseNotebook(json: string): Notebook | null {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return null
  }
  if (!doc || typeof doc !== "object") return null
  const nb = doc as Record<string, unknown>
  const cells = nb.cells
  if (!Array.isArray(cells)) return null

  const meta = (nb.metadata ?? {}) as Record<string, unknown>
  const kernel = (meta.kernelspec ?? {}) as Record<string, unknown>
  const info = (meta.language_info ?? {}) as Record<string, unknown>
  const language =
    (typeof info.name === "string" && info.name) ||
    (typeof kernel.language === "string" && kernel.language) ||
    "python"

  return {
    language,
    cells: cells.map((raw, i) => {
      const cell = (raw ?? {}) as Record<string, unknown>
      const type =
        cell.cell_type === "markdown" ? "markdown" : cell.cell_type === "raw" ? "raw" : "code"
      const outputs = Array.isArray(cell.outputs) ? cell.outputs : []
      return {
        id: typeof cell.id === "string" && cell.id ? cell.id : `cell-${i}`,
        type,
        source: joined(cell.source),
        executionCount: typeof cell.execution_count === "number" ? cell.execution_count : null,
        outputs: outputs
          .map((o) => readOutput((o ?? {}) as Record<string, unknown>))
          .filter((o): o is NbOutput => o !== null),
      }
    }),
  }
}

/** Whether a path is a notebook, by the only thing that names one. */
export const isNotebook = (path: string) => path.toLowerCase().endsWith(".ipynb")
