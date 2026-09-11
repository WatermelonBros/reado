// The Output panel's buffer: bounded, filterable, and fed by the same `emit`
// that writes the log file.
import { beforeEach, describe, expect, it, vi } from "vitest"

const invoke = vi.fn(async () => null)
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...(a as [])) }))

import { applyLogConfig, createLogger } from "@/lib/logger"
import { channelsOf, filterRecords, formatRecord, OUTPUT_LIMIT, useOutput } from "@/lib/outputLog"

const add = (channel: string, level: "error" | "warn" | "info" | "debug" = "info", msg = "m") =>
  useOutput.getState().add({ at: 0, level, channel, msg })

beforeEach(() => {
  useOutput.setState({ records: [] })
  applyLogConfig(true, "info")
})

describe("the buffer", () => {
  it("keeps the newest records and drops the oldest past its cap", () => {
    for (let i = 0; i < OUTPUT_LIMIT + 10; i++) add("app", "info", `m${i}`)
    const { records } = useOutput.getState()
    expect(records).toHaveLength(OUTPUT_LIMIT)
    expect(records[0].msg).toBe("m10")
    expect(records[records.length - 1].msg).toBe(`m${OUTPUT_LIMIT + 9}`)
  })

  it("offers only the channels that have actually been seen", () => {
    add("lsp")
    add("ipc")
    add("lsp")
    expect(channelsOf(useOutput.getState().records)).toEqual(["ipc", "lsp"])
  })

  it("collects what the app logs, through the same gate as the file", () => {
    const log = createLogger("git")
    log.info("fetched", { remote: "origin" })
    // Below the threshold: not written to the file, not shown here either.
    log.debug("noisy")
    const { records } = useOutput.getState()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ channel: "git", level: "info", msg: "fetched" })

    // Logging off means collecting nothing at all.
    applyLogConfig(false, "info")
    log.error("boom")
    expect(useOutput.getState().records).toHaveLength(1)
  })
})

describe("filters", () => {
  const records = [
    { seq: 1, at: 0, level: "error" as const, channel: "lsp", msg: "server stopped" },
    { seq: 2, at: 0, level: "debug" as const, channel: "ipc", msg: "read_file" },
    { seq: 3, at: 0, level: "info" as const, channel: "lsp", msg: "server started" },
  ]

  it("select by channel, by level, and by text — and compose", () => {
    expect(filterRecords(records, { channel: "lsp" }).map((r) => r.seq)).toEqual([1, 3])
    // Level is a threshold, not an equality: "info" keeps errors and warnings.
    expect(filterRecords(records, { level: "info" }).map((r) => r.seq)).toEqual([1, 3])
    expect(filterRecords(records, { text: "started" }).map((r) => r.seq)).toEqual([3])
    expect(filterRecords(records, { channel: "lsp", text: "stop" }).map((r) => r.seq)).toEqual([1])
  })

  it("searches the fields as well as the message", () => {
    const withFields = [{ ...records[1], fields: { path: "src/app.tsx" } }]
    expect(filterRecords(withFields, { text: "app.tsx" })).toHaveLength(1)
  })

  it("formats a record as one copyable line", () => {
    expect(formatRecord({ ...records[0], fields: { id: "typescript" } })).toContain(
      'ERROR lsp server stopped {"id":"typescript"}',
    )
  })
})
