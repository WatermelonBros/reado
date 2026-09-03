// Agent notifications: OS notification (permission-gated) + optional chime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const settings = { completionSound: false }
vi.mock("../store", () => ({ useSettings: { getState: () => settings } }))

import { notifyResolved } from "@/lib/notify"

const created: Array<{ title: string; body?: string }> = []
let requestPermission: ReturnType<typeof vi.fn>

/** Install a Notification stub in the given permission state. */
function stubNotification(permission: NotificationPermission, granted = true) {
  requestPermission = vi.fn(async () => (granted ? "granted" : "denied"))
  class FakeNotification {
    static permission = permission
    static requestPermission = requestPermission
    constructor(title: string, opts?: { body?: string }) {
      created.push({ title, body: opts?.body })
    }
  }
  vi.stubGlobal("Notification", FakeNotification)
}

beforeEach(() => {
  created.length = 0
  settings.completionSound = false
})
afterEach(() => vi.unstubAllGlobals())

describe("notifyResolved", () => {
  it("says the review is complete when nothing is left", async () => {
    stubNotification("granted")
    await notifyResolved(0)
    expect(created).toEqual([{ title: "Reado", body: "Review complete — all tasks resolved." }])
  })

  it("counts what's still open otherwise", async () => {
    stubNotification("granted")
    await notifyResolved(3)
    expect(created[0].body).toBe("A task was resolved — 3 remaining.")
  })

  it("stays silent when the user denied notifications", async () => {
    stubNotification("denied")
    await notifyResolved(1)
    expect(created).toHaveLength(0)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it("asks for permission once, and doesn't nag after a refusal", async () => {
    stubNotification("default", false)
    await notifyResolved(1)
    await notifyResolved(1)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(created).toHaveLength(0)
  })

  it("does nothing where the Notification API doesn't exist", async () => {
    vi.stubGlobal("Notification", undefined)
    await expect(notifyResolved(1)).resolves.toBeUndefined()
  })

  it("chimes only when the setting is on", async () => {
    stubNotification("granted")
    const close = vi.fn()
    const audio = vi.fn(() => ({
      currentTime: 0,
      createOscillator: () => ({
        type: "",
        frequency: { value: 0 },
        connect: (n: unknown) => n,
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (n: unknown) => n,
      }),
      destination: {},
      close,
    }))
    vi.stubGlobal("AudioContext", audio)

    await notifyResolved(1)
    expect(audio).not.toHaveBeenCalled()

    settings.completionSound = true
    await notifyResolved(1)
    expect(audio).toHaveBeenCalled()
  })

  it("still notifies when audio is unavailable", async () => {
    stubNotification("granted")
    settings.completionSound = true
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("no audio device")
      }),
    )
    await expect(notifyResolved(0)).resolves.toBeUndefined()
    expect(created).toHaveLength(1)
  })
})
