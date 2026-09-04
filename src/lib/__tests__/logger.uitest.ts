// Frontend logging: the local level gate, the IPC boundary trace, and the
// promise that argument *values* never reach the log.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }))

import { invoke } from "@tauri-apps/api/core"
import { applyLogConfig, createLogger, log, logPath, safeError, tracedInvoke } from "@/lib/logger"

/** The `log_record` calls made so far. */
const records = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter(([cmd]) => cmd === "log_record")
    .map(([, args]) => args as Record<string, unknown>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(invoke).mockResolvedValue(null)
  applyLogConfig(true, "info")
})
afterEach(() => applyLogConfig(true, "info"))

describe("applyLogConfig", () => {
  it("pushes the preference to the backend too", () => {
    applyLogConfig(false, "debug")
    expect(invoke).toHaveBeenCalledWith("log_set_config", { enabled: false, level: "debug" })
  })

  it("falls back to info for an unknown level", () => {
    applyLogConfig(true, "nonsense" as never)
    log.info("kept")
    log.debug("dropped")
    expect(records().map((r) => r.msg)).toEqual(["kept"])
  })

  it("applies the config locally even when the backend push fails", () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no backend"))
    applyLogConfig(false, "trace")
    vi.mocked(invoke).mockResolvedValue(null)
    log.error("x")
    // Logging off is a local decision: a dead backend must not re-enable it.
    expect(records()).toHaveLength(0)
  })
})

describe("the level gate", () => {
  it("drops records below the threshold before paying for the IPC call", () => {
    log.debug("noisy")
    log.trace("noisier")
    expect(records()).toHaveLength(0)
  })

  it("emits at and above the threshold", () => {
    log.error("bad")
    log.warn("hmm")
    log.info("fyi")
    expect(records().map((r) => r.level)).toEqual(["error", "warn", "info"])
  })

  it("drops everything when logging is off", () => {
    applyLogConfig(false, "trace")
    log.error("bad")
    expect(records()).toHaveLength(0)
  })

  it("lets everything through at trace", () => {
    applyLogConfig(true, "trace")
    createLogger("test").trace("deep")
    expect(records()).toHaveLength(1)
  })
})

describe("createLogger", () => {
  it("tags each record with its subsystem and fields", () => {
    createLogger("git").info("cloned", { repo: "x" })
    expect(records()[0]).toEqual({
      level: "info",
      target: "git",
      msg: "cloned",
      fields: { repo: "x" },
    })
  })

  it("sends null rather than undefined when there are no fields", () => {
    log.info("plain")
    expect(records()[0].fields).toBeNull()
  })

  it("keeps logging after a forward fails", () => {
    vi.mocked(invoke).mockRejectedValue(new Error("ipc down"))
    log.error("bad")
    expect(invoke).toHaveBeenCalledWith("log_record", expect.objectContaining({ msg: "bad" }))
    vi.mocked(invoke).mockResolvedValue(null)
    log.info("after")
    expect(records().map((r) => r.msg)).toEqual(["bad", "after"])
  })
})

describe("tracedInvoke", () => {
  it("returns the command's result and traces the call at debug", async () => {
    applyLogConfig(true, "debug")
    vi.mocked(invoke).mockResolvedValue("ok")
    await expect(tracedInvoke("read_file", { root: "/r", path: "a.ts" })).resolves.toBe("ok")
    const rec = records()[0]
    expect(rec).toMatchObject({ level: "debug", target: "ipc", msg: "read_file" })
    // Keys only: a path or a file's contents must never land in the log.
    expect(rec.fields).toMatchObject({ args: ["root", "path"] })
    expect(JSON.stringify(rec.fields)).not.toContain("a.ts")
  })

  it("logs a failure and still rethrows it", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "read_file") throw new Error("ENOENT")
      return null
    })
    await expect(tracedInvoke("read_file", { path: "a.ts" })).rejects.toThrow("ENOENT")
    expect(records()[0]).toMatchObject({ level: "error", msg: "read_file failed" })
    expect((records()[0].fields as { error: string }).error).toBe("Error: ENOENT")
  })

  it("never traces the logging commands — that would recurse", async () => {
    applyLogConfig(true, "trace")
    await tracedInvoke("log_path")
    expect(records()).toHaveLength(0)
  })
})

describe("safeError", () => {
  it("keeps the error's name and message", () => {
    expect(safeError(new TypeError("bad input"))).toBe("TypeError: bad input")
  })

  it("stringifies a non-Error", () => {
    expect(safeError("plain string")).toBe("plain string")
    expect(safeError(undefined)).toBe("undefined")
  })

  it("caps the length so a payload can't be dumped through it", () => {
    const out = safeError(new Error("x".repeat(500)))
    expect(out).toHaveLength(201)
    expect(out.endsWith("…")).toBe(true)
  })

  it("honours a custom cap", () => {
    expect(safeError(new Error("abcdefghij"), 5)).toBe("Error…")
  })
})

describe("logPath", () => {
  it("returns the backend's path", async () => {
    vi.mocked(invoke).mockResolvedValue("/tmp/reado.log")
    await expect(logPath()).resolves.toBe("/tmp/reado.log")
    expect(invoke).toHaveBeenCalledWith("log_path")
  })

  it("returns null instead of throwing when there's no backend", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no backend"))
    await expect(logPath()).resolves.toBeNull()
  })
})
