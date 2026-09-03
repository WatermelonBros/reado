// Reado Anywhere: the paths the first test file doesn't reach — the macOS
// local-network priming, pairing a second device, the per-preference writes,
// the relative "last seen", and how each backend failure surfaces.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  anywhereStatus: vi.fn(),
  anywhereEnable: vi.fn(),
  anywhereDisable: vi.fn(),
  anywhereDevices: vi.fn(),
  anywhereRevoke: vi.fn(),
  anywhereRevokeAll: vi.fn(),
  anywhereConfig: vi.fn(),
  anywhereInterfaces: vi.fn(),
  anywhereNewPairing: vi.fn(),
  anywhereSetBind: vi.fn(),
  anywhereSetLifetimes: vi.fn(),
  anywhereSetMdns: vi.fn(),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ...api,
}))
let os = "mac"
vi.mock("../../../lib/extensions", async (orig) => ({
  ...(await orig<typeof import("../../../lib/extensions")>()),
  currentOS: () => os,
}))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }))

import { AnywhereDialog } from "@/components/organisms/AnywhereDialog"
import { usePalette } from "@/lib/store"

const info = { url: "https://192.168.1.5:7000", pairing: "one-use-secret", fingerprint: "AA:BB" }
const config = { idleDays: 30, maxDays: 90, bind: null, mdns: false }
const now = () => Math.floor(Date.now() / 1000)

beforeEach(() => {
  vi.clearAllMocks()
  os = "mac"
  localStorage.clear()
  usePalette.setState({ anywhereOpen: true })
  api.anywhereStatus.mockResolvedValue(null)
  api.anywhereEnable.mockResolvedValue(info)
  api.anywhereDisable.mockResolvedValue(undefined)
  api.anywhereDevices.mockResolvedValue([])
  api.anywhereRevoke.mockResolvedValue(true)
  api.anywhereRevokeAll.mockResolvedValue(2)
  api.anywhereConfig.mockResolvedValue(config)
  api.anywhereInterfaces.mockResolvedValue([{ name: "en0", addr: "192.168.1.5" }])
  api.anywhereNewPairing.mockResolvedValue({ ...info, pairing: "second-secret" })
  api.anywhereSetBind.mockResolvedValue(undefined)
  api.anywhereSetLifetimes.mockResolvedValue(undefined)
  api.anywhereSetMdns.mockResolvedValue(undefined)
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn(async () => {}) },
    userAgent: "test",
    language: "en",
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("the macOS local-network prompt", () => {
  it("is explained before it appears, the first time", async () => {
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    // Priming first: the OS prompt is about to appear, and unexplained it reads
    // as Reado asking for something it shouldn't.
    expect(api.anywhereEnable).not.toHaveBeenCalled()
    expect(await screen.findByText("anywhere.primeTitle")).toBeInTheDocument()
  })

  it("enables for real once the explanation is acknowledged", async () => {
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.primeContinue" }))
    await waitFor(() => expect(api.anywhereEnable).toHaveBeenCalled())
    expect(localStorage.getItem("reado.anywhere.primed")).toBe("1")
  })

  it("doesn't explain twice", async () => {
    localStorage.setItem("reado.anywhere.primed", "1")
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    await waitFor(() => expect(api.anywhereEnable).toHaveBeenCalled())
  })

  it("doesn't explain at all off macOS, where there is no such prompt", async () => {
    os = "linux"
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    await waitFor(() => expect(api.anywhereEnable).toHaveBeenCalled())
  })
})

describe("pairing", () => {
  it("mints a fresh code for a second device", async () => {
    api.anywhereStatus.mockResolvedValue(info)
    render(<AnywhereDialog />)
    const again = await screen.findByRole("button", { name: /anywhere\.pairAnother/ })
    await userEvent.click(again)
    await waitFor(() => expect(api.anywhereNewPairing).toHaveBeenCalled())
  })

  it("surfaces a failed pairing rather than a silent no-op", async () => {
    api.anywhereStatus.mockResolvedValue(info)
    api.anywhereNewPairing.mockRejectedValue(new Error("port already in use"))
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: /anywhere\.pairAnother/ }))
    expect(await screen.findByText(/port already in use/)).toBeInTheDocument()
  })

  it("surfaces a failed enable and a failed disable", async () => {
    os = "linux"
    api.anywhereEnable.mockRejectedValue(new Error("cannot bind"))
    const { unmount } = render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    expect(await screen.findByText(/cannot bind/)).toBeInTheDocument()
    unmount()

    api.anywhereStatus.mockResolvedValue(info)
    api.anywhereDisable.mockRejectedValue(new Error("already stopped"))
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.stop" }))
    expect(await screen.findByText(/already stopped/)).toBeInTheDocument()
  })
})

describe("the paired devices", () => {
  it("says how long ago each was seen, in words", async () => {
    api.anywhereDevices.mockResolvedValue([
      { id: "d1", name: "Phone", created: now() - 86_400, lastSeen: now() - 600 },
      { id: "d2", name: "Tablet", created: now() - 86_400, lastSeen: now() - 7_200 },
      { id: "d3", name: "Laptop", created: now() - 86_400, lastSeen: now() - 3 * 86_400 },
    ])
    render(<AnywhereDialog />)
    expect(await screen.findByText("Phone")).toBeInTheDocument()
    expect(screen.getByText(/10 minutes ago/)).toBeInTheDocument()
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument()
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument()
  })

  it("reports a failed revoke instead of pretending it worked", async () => {
    api.anywhereDevices.mockResolvedValue([
      { id: "d1", name: "Phone", created: now(), lastSeen: now() },
    ])
    api.anywhereRevoke.mockRejectedValue(new Error("no such device"))
    render(<AnywhereDialog />)
    await screen.findByText("Phone")
    await userEvent.click(screen.getByRole("button", { name: /anywhere\.revoke$/ }))
    expect(await screen.findByText(/no such device/)).toBeInTheDocument()
  })

  it("reports a failed revoke-all too", async () => {
    // The bulk action only appears once there's more than one device to revoke.
    api.anywhereDevices.mockResolvedValue([
      { id: "d1", name: "Phone", created: now(), lastSeen: now() },
      { id: "d2", name: "Tablet", created: now(), lastSeen: now() },
    ])
    api.anywhereRevokeAll.mockRejectedValue(new Error("locked"))
    render(<AnywhereDialog />)
    await screen.findByText("Phone")
    await userEvent.click(screen.getByRole("button", { name: /anywhere\.revokeAll/ }))
    expect(await screen.findByText(/locked/)).toBeInTheDocument()
  })

  it("shows the no-devices state when the list can't be read", async () => {
    api.anywhereDevices.mockRejectedValue(new Error("no store"))
    render(<AnywhereDialog />)
    // Not "no Phone" — that would hold anyway. The panel has to say, positively,
    // that nothing is paired, and offer no revoke for a device it can't see.
    expect(await screen.findByText("anywhere.noDevices")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /anywhere\.revoke/ })).not.toBeInTheDocument()
  })
})

describe("the security preferences", () => {
  it("binds to a chosen interface, and back to automatic", async () => {
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("combobox", { name: "anywhere.iface" }))
    // Ark renders the listbox in a portal; pick the interface by its own label.
    await userEvent.click(await screen.findByText("en0 · 192.168.1.5"))
    await waitFor(() => expect(api.anywhereSetBind).toHaveBeenCalledWith("192.168.1.5"))

    await userEvent.click(screen.getByRole("combobox", { name: "anywhere.iface" }))
    await userEvent.click((await screen.findAllByText("anywhere.ifaceAuto"))[0])
    await waitFor(() => expect(api.anywhereSetBind).toHaveBeenLastCalledWith(null))
  })

  it("writes both credential lifetimes together", async () => {
    render(<AnywhereDialog />)
    const idle = await screen.findByDisplayValue("30")
    await userEvent.clear(idle)
    await userEvent.type(idle, "7")
    await waitFor(() => expect(api.anywhereSetLifetimes).toHaveBeenCalledWith(7, 90))
  })

  it("surfaces a rejected preference write", async () => {
    api.anywhereSetMdns.mockRejectedValue(new Error("read-only config"))
    render(<AnywhereDialog />)
    const mdns = await screen.findByRole("checkbox", { name: /anywhere\.mdns/ })
    await userEvent.click(mdns)
    expect(await screen.findByText(/read-only config/)).toBeInTheDocument()
  })

  it("shows no preferences at all when the config can't be read", async () => {
    api.anywhereConfig.mockRejectedValue(new Error("no config"))
    render(<AnywhereDialog />)
    await waitFor(() => expect(api.anywhereConfig).toHaveBeenCalled())
    expect(screen.queryByRole("combobox", { name: "anywhere.iface" })).not.toBeInTheDocument()
  })
})
