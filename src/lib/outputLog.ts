/**
 * The Output panel's buffer: what Reado is logging, right now, in the app.
 *
 * Every record already passes through `logger.emit` on its way to the file sink,
 * so this is a tap on that path rather than a second logging system. The file
 * remains the record of what happened; this is the view of what is happening,
 * and it is bounded — a log you keep forever in memory is a leak with a UI.
 *
 * Channels are the record's `target` (`lsp`, `ipc`, `git`, `app`, …), plus one
 * per language server for the lines that server prints on stderr. They are
 * derived from what has actually arrived, so the list can never offer an empty
 * channel and there is no registry to keep in step.
 */
import { listen } from "@tauri-apps/api/event"
import { create } from "zustand"
import type { LogLevel } from "./logger"

export interface OutputRecord {
  /** Monotonic id: records arrive in bursts and the timestamp is not unique. */
  seq: number
  at: number
  level: LogLevel
  channel: string
  msg: string
  fields?: Record<string, unknown>
}

/** How many records the panel holds. Past this the oldest go. */
export const OUTPUT_LIMIT = 2000

interface OutputState {
  records: OutputRecord[]
  add: (r: Omit<OutputRecord, "seq">) => void
  clear: () => void
}

let seq = 0

export const useOutput = create<OutputState>((set) => ({
  records: [],
  add: (r) =>
    set((s) => {
      const next = [...s.records, { ...r, seq: seq++ }]
      return { records: next.length > OUTPUT_LIMIT ? next.slice(-OUTPUT_LIMIT) : next }
    }),
  clear: () => set({ records: [] }),
}))

/** The channels seen so far, in the order a reader wants them: alphabetical. */
export const channelsOf = (records: OutputRecord[]): string[] =>
  [...new Set(records.map((r) => r.channel))].sort()

/** The records a given channel / level / text filter selects. */
export function filterRecords(
  records: OutputRecord[],
  opts: { channel?: string | null; level?: LogLevel | null; text?: string },
): OutputRecord[] {
  const order: LogLevel[] = ["error", "warn", "info", "debug", "trace"]
  const max = opts.level ? order.indexOf(opts.level) : order.length - 1
  const text = opts.text?.trim().toLowerCase()
  return records.filter((r) => {
    if (opts.channel && r.channel !== opts.channel) return false
    if (order.indexOf(r.level) > max) return false
    if (text && !`${r.msg} ${JSON.stringify(r.fields ?? {})}`.toLowerCase().includes(text))
      return false
    return true
  })
}

/** One record as a line of text, for "copy all". */
export const formatRecord = (r: OutputRecord): string =>
  `${new Date(r.at).toISOString()} ${r.level.toUpperCase().padEnd(5)} ${r.channel} ${r.msg}${
    r.fields && Object.keys(r.fields).length ? ` ${JSON.stringify(r.fields)}` : ""
  }`

/** Land the language servers' own stderr on their own channels. Started once,
 *  from the app shell. */
export function listenToServerOutput(): Promise<() => void> {
  return listen<{ id: string; line: string }>("lsp-stderr", ({ payload }) => {
    useOutput.getState().add({
      at: Date.now(),
      level: "warn",
      channel: `lsp:${payload.id}`,
      msg: payload.line,
    })
  })
}
