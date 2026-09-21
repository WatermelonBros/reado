// Reading a pane's output as lines. The backend reads the PTY in 8 KB blocks,
// so a chunk boundary lands mid-line routinely in any long run — and a consumer
// that splits each chunk on its own sees the two halves of a verdict line and
// matches neither, silently. The tail is held in one place so that no reader
// has to know the framing; these tests are what hold it there.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (event: { payload: string }) => void
const handlers = new Map<string, Handler>()
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: Handler) => {
    handlers.set(name, handler)
    return Promise.resolve(() => handlers.delete(name))
  },
}))

import { listenPtyLines, offSafe } from "@/lib/terminals"

/** What the backend sends: base64 of raw bytes. */
const frame = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

const emit = (id: string, text: string) =>
  handlers.get(`pty-output-${id}`)?.({ payload: frame(text) })

beforeEach(() => handlers.clear())

describe("pty output as lines", () => {
  it("hands over complete lines and holds the rest", async () => {
    const lines: string[] = []
    await listenPtyLines("p1", (l) => lines.push(l))
    emit("p1", "one\ntwo\nthr")
    expect(lines).toEqual(["one", "two"])
    emit("p1", "ee\n")
    expect(lines).toEqual(["one", "two", "three"])
  })

  it("rejoins a line split across two reads", async () => {
    // The real failure: a verdict arriving as two chunks matched neither half,
    // and the test stayed "running" with nothing to debug.
    const lines: string[] = []
    await listenPtyLines("p2", (l) => lines.push(l))
    emit("p2", " ✓ src/a.test.ts > wo")
    expect(lines).toEqual([])
    emit("p2", "rks 1ms\n")
    expect(lines).toEqual([" ✓ src/a.test.ts > works 1ms"])
  })

  it("keeps a multi-byte character whole across a read boundary", async () => {
    const lines: string[] = []
    await listenPtyLines("p3", (l) => lines.push(l))
    // A stream decoder is what stops the two halves of "✓" becoming U+FFFD.
    const bytes = new TextEncoder().encode("✓ ok\n")
    handlers.get("pty-output-p3")?.({
      payload: btoa(String.fromCharCode(...bytes.slice(0, 2))),
    })
    handlers.get("pty-output-p3")?.({
      payload: btoa(String.fromCharCode(...bytes.slice(2))),
    })
    expect(lines).toEqual(["✓ ok"])
  })

  it("stops listening when unsubscribed", async () => {
    const lines: string[] = []
    const off = await listenPtyLines("p4", (l) => lines.push(l))
    off()
    emit("p4", "after\n")
    expect(lines).toEqual([])
  })
})

describe("offSafe", () => {
  // Tauri's unlisten rejects when its listener map has already been torn down —
  // the normal case, because the thing being unsubscribed from is a PTY that
  // just died. Two call sites guarded it by hand and five did not, and the same
  // `listeners[eventId].handlerId` unhandled rejection kept surfacing from
  // terminals, comments and search alike.
  it("swallows a rejecting unlisten instead of letting it escape", async () => {
    const rejecting = () => Promise.reject(new Error("listener map already gone"))
    const escaped: unknown[] = []
    const onRejection = (e: PromiseRejectionEvent) => escaped.push(e.reason)
    window.addEventListener("unhandledrejection", onRejection)
    offSafe(rejecting)
    offSafe(Promise.resolve(rejecting))
    await new Promise((r) => setTimeout(r, 10))
    window.removeEventListener("unhandledrejection", onRejection)
    expect(escaped).toEqual([])
  })

  it("calls the unsubscribe it was given, promise or not", async () => {
    const calls: string[] = []
    offSafe(() => calls.push("direct"))
    offSafe(Promise.resolve(() => calls.push("awaited")))
    await new Promise((r) => setTimeout(r, 10))
    expect(calls).toEqual(["direct", "awaited"])
  })

  it("does nothing when there is nothing to unsubscribe", () => {
    expect(() => {
      offSafe(null)
      offSafe(undefined)
    }).not.toThrow()
  })
})
