// Signed auto-updates: what a check does when there's nothing new, something
// new, the same thing again, or no update server at all — and how loudly,
// depending on whether the user asked.
import { beforeEach, describe, expect, it, vi } from "vitest"

const check = vi.fn(async () => null as { version: string } | null)
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }))

import { useUpdate } from "@/lib/update"
import { checkForUpdates } from "@/lib/updater"

const state = {
  setToast: vi.fn(),
  setAvailable: vi.fn(),
  reopen: vi.fn(),
  version: null as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  state.version = null
  vi.spyOn(useUpdate, "getState").mockImplementation(
    () => state as unknown as ReturnType<typeof useUpdate.getState>,
  )
  check.mockResolvedValue(null)
})

describe("when there is nothing new", () => {
  it("says so only when the user asked", async () => {
    await checkForUpdates(true)
    expect(state.setToast).toHaveBeenCalledWith({ kind: "info", text: "Reado is up to date." })
  })

  it("stays silent on the background check", async () => {
    await checkForUpdates(false)
    expect(state.setToast).not.toHaveBeenCalled()
    expect(state.setAvailable).not.toHaveBeenCalled()
  })
})

describe("when an update is available", () => {
  it("hands it to the update store, which drives the modal", async () => {
    const update = { version: "2.0.0" }
    check.mockResolvedValue(update)
    await checkForUpdates(false)
    expect(state.setAvailable).toHaveBeenCalledWith(update)
  })

  it("won't re-nag in the background about a version already surfaced", async () => {
    check.mockResolvedValue({ version: "2.0.0" })
    state.version = "2.0.0"
    await checkForUpdates(false)
    expect(state.setAvailable).not.toHaveBeenCalled()
    expect(state.reopen).not.toHaveBeenCalled()
  })

  it("but a manual check reopens the modal for it", async () => {
    check.mockResolvedValue({ version: "2.0.0" })
    state.version = "2.0.0"
    await checkForUpdates(true)
    expect(state.reopen).toHaveBeenCalled()
    expect(state.setAvailable).not.toHaveBeenCalled()
  })
})

describe("when the update server can't be reached", () => {
  it("fails quietly in the background — dev builds have no server", async () => {
    check.mockRejectedValue(new Error("network unreachable"))
    await expect(checkForUpdates(false)).resolves.toBeUndefined()
    expect(state.setToast).not.toHaveBeenCalled()
  })

  it("but tells the user who asked, with the reason", async () => {
    check.mockRejectedValue(new Error("network unreachable"))
    await checkForUpdates(true)
    expect(state.setToast).toHaveBeenCalledWith({
      kind: "error",
      text: expect.stringContaining("network unreachable"),
    })
  })
})
