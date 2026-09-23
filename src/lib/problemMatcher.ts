/**
 * Problem matchers: turning what a task prints into entries you can click.
 *
 * Pure text in, problems out — the stream a task's terminal shows is read line by
 * line on its way to the screen (see `tasks.ts`).
 */
import { createLogger } from "./logger"
import { plainText } from "./ptyText"

const log = createLogger("tasks")

/** One entry a matcher found in a task's output. */
export interface TaskProblem {
  /** Project-relative or absolute, as the compiler printed it. */
  path: string
  line: number
  character: number
  /** LSP severity: 1 error, 2 warning, 3 info. */
  severity: number
  message: string
}

const severityOf = (word: string): number => (/^err/i.test(word) ? 1 : /^warn/i.test(word) ? 2 : 3)

/** `src/a.ts(12,5): error TS2345: message` — tsc, and MSBuild. */
const TSC = /^(.+?)\((\d+),(\d+)\):\s*(error|warning|info)\b[^:]*:\s*(.+)$/
/** `src/a.ts:12:5: error: message` — gcc, eslint's compact format, and most
 *  things that print a location at all. */
const COLON = /^(.+?):(\d+):(\d+):\s*(error|warning|info|note)?:?\s*(.+)$/
/** cargo's first line: `error[E0308]: mismatched types`. */
const CARGO_HEAD = /^(error|warning)(\[[A-Za-z0-9]+\])?:\s*(.+)$/
/** cargo's second line: `  --> src/main.rs:5:9`. */
const CARGO_LOC = /^\s*-->\s*(.+?):(\d+):(\d+)\s*$/
/** eslint/jshint "stylish": the file on its own line, then indented rows. */
const STYLISH_FILE = /^(?![\s>])([^\s:]*[\\/][^\s:]+|[^\s:]+\.[A-Za-z]+)\s*$/
const STYLISH_ROW = /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)(?:\s{2,}\S+)?\s*$/

/** The shapes a matcher can read. One name maps to one shape; several names map
 *  to the same shape when the tools print the same thing (gcc and eslint's
 *  compact format really are the same line). */
type Shape = "tsc" | "colon" | "cargo" | "stylish"

/**
 * Problem matchers by the names VS Code uses, so a `.vscode/tasks.json` that
 * says `"problemMatcher": "$tsc"` gets tsc's parse and not a guess.
 *
 * The names are VS Code's built-ins plus the two every Rust and Go project has
 * from an extension (`$rustc`, `$go`). A name Reado doesn't know is ignored with
 * a warning rather than failing the task — the command still runs.
 */
const NAMED: Record<string, Shape> = {
  $tsc: "tsc",
  "$tsc-watch": "tsc",
  $msCompile: "tsc",
  $lessCompile: "tsc",
  $gcc: "colon",
  $go: "colon",
  $python: "colon",
  "$eslint-compact": "colon",
  $jshint: "colon",
  $rustc: "cargo",
  $cargo: "cargo",
  "$eslint-stylish": "stylish",
  "$jshint-stylish": "stylish",
}

/** Every shape — what a task with no `problemMatcher` gets, as before names. */
const ALL_SHAPES: Shape[] = ["tsc", "colon", "cargo", "stylish"]

/** The shapes a task's `problemMatcher` names resolve to. */
export function shapesFor(names: string[] | undefined): Shape[] {
  if (names === undefined) return ALL_SHAPES
  const shapes = new Set<Shape>()
  for (const name of names) {
    const shape = NAMED[name]
    if (shape) shapes.add(shape)
    else log.warn("unknown problem matcher", { name })
  }
  return [...shapes]
}

/**
 * A matcher reading one run's output.
 *
 * Stateful because two of the four shapes span lines — cargo prints the message
 * then the location, eslint's stylish format prints the file then its rows — and
 * a matcher that only ever sees one line at a time cannot join them.
 */
export function createMatcher(names?: string[]): { push: (raw: string) => TaskProblem[] } {
  const shapes = new Set(shapesFor(names))
  let pending: { severity: number; message: string } | null = null
  let stylishFile: string | null = null
  return {
    push(raw) {
      const line = plainText(raw)
      if (!line.trim()) return []
      if (pending) {
        const loc = CARGO_LOC.exec(line)
        if (loc) {
          const found = {
            path: loc[1],
            line: Number(loc[2]),
            character: Number(loc[3]),
            severity: pending.severity,
            message: pending.message,
          }
          pending = null
          return [found]
        }
        // The location has to be the very next line; anything else means that
        // message had none, and holding it would attach it to the wrong file.
        pending = null
      }
      if (shapes.has("stylish") && stylishFile) {
        const row = STYLISH_ROW.exec(line)
        if (row)
          return [
            {
              path: stylishFile,
              line: Number(row[1]),
              character: Number(row[2]),
              severity: severityOf(row[3]),
              message: row[4].trim(),
            },
          ]
      }
      if (shapes.has("tsc")) {
        const tsc = TSC.exec(line)
        if (tsc)
          return [
            {
              path: tsc[1].trim(),
              line: Number(tsc[2]),
              character: Number(tsc[3]),
              severity: severityOf(tsc[4]),
              message: tsc[5].trim(),
            },
          ]
      }
      if (shapes.has("colon")) {
        const colon = COLON.exec(line)
        // A bare `10:5: something` has no path worth clicking, and a Windows
        // `C:\x.ts:1:1` would otherwise be read as a path of "C".
        if (colon && colon[1].trim().length > 1) {
          const path = colon[1].trim()
          return [
            {
              path,
              line: Number(colon[2]),
              character: Number(colon[3]),
              severity: severityOf(colon[4] ?? "error"),
              message: colon[5].trim(),
            },
          ]
        }
      }
      if (shapes.has("cargo")) {
        const head = CARGO_HEAD.exec(line)
        if (head) {
          pending = { severity: severityOf(head[1]), message: head[3].trim() }
          return []
        }
      }
      // Last, so a path-shaped line that is really a diagnostic is read as one
      // first: the stylish header is the least specific pattern here.
      if (shapes.has("stylish")) {
        const file = STYLISH_FILE.exec(line)
        if (file) stylishFile = file[1]
      }
      return []
    },
  }
}
