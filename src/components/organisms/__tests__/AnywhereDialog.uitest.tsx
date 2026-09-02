// Reado Anywhere pairing dialog: the disabled (tagline) state, enabling the
// server (renders the QR + stop control), copying the URL, disabling again, and
// the device-management surface — the paired list, revoking one device, and the
// security settings. `../../lib/api` is mocked at the Anywhere commands; i18n is
// mocked to keys.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const anywhereStatus = vi.fn()
const anywhereEnable = vi.fn()
const anywhereDisable = vi.fn()
const anywhereDevices = vi.fn()
const anywhereRevoke = vi.fn()
const anywhereRevokeAll = vi.fn()
const anywhereConfig = vi.fn()
const anywhereInterfaces = vi.fn()
const anywhereNewPairing = vi.fn()
const anywhereSetBind = vi.fn()
const anywhereSetLifetimes = vi.fn()
const anywhereSetMdns = vi.fn()
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  anywhereStatus: () => anywhereStatus(),
  anywhereEnable: () => anywhereEnable(),
  anywhereDisable: () => anywhereDisable(),
  anywhereDevices: () => anywhereDevices(),
  anywhereRevoke: (id: string) => anywhereRevoke(id),
  anywhereRevokeAll: () => anywhereRevokeAll(),
  anywhereConfig: () => anywhereConfig(),
  anywhereInterfaces: () => anywhereInterfaces(),
  anywhereNewPairing: () => anywhereNewPairing(),
  anywhereSetBind: (bind: string | null) => anywhereSetBind(bind),
  anywhereSetLifetimes: (idle: number, max: number) => anywhereSetLifetimes(idle, max),
  anywhereSetMdns: (on: boolean) => anywhereSetMdns(on),
}))
// The dialog subscribes to the backend's "a device paired" event; without a stub
// the real bridge reaches for a Tauri global that a DOM test doesn't have.
const unlisten = vi.fn()
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(unlisten)) }))

import { AnywhereDialog } from "@/components/organisms/AnywhereDialog"
import { usePalette } from "@/lib/store"

const info = {
  url: "https://192.168.1.5:7000",
  pairing: "one-use-secret",
  fingerprint: "AA:BB:CC",
}

const device = (over: Partial<{ id: string; name: string }> = {}) => ({
  id: "d1",
  name: "Matteo's iPhone",
  created: Math.floor(Date.now() / 1000) - 86_400,
  lastSeen: Math.floor(Date.now() / 1000) - 3600,
  ...over,
})

const config = { idleDays: 30, maxDays: 90, bind: null, mdns: false }

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  usePalette.setState({ anywhereOpen: false })
  anywhereStatus.mockResolvedValue(null)
  anywhereEnable.mockResolvedValue(info)
  anywhereDisable.mockResolvedValue(undefined)
  anywhereDevices.mockResolvedValue([])
  anywhereRevoke.mockResolvedValue(true)
  anywhereRevokeAll.mockResolvedValue(2)
  anywhereConfig.mockResolvedValue(config)
  anywhereInterfaces.mockResolvedValue([{ name: "en0", addr: "192.168.1.5" }])
  anywhereNewPairing.mockResolvedValue({ ...info, pairing: "second-secret" })
  anywhereSetBind.mockResolvedValue(undefined)
  anywhereSetLifetimes.mockResolvedValue(undefined)
  anywhereSetMdns.mockResolvedValue(undefined)
  vi.stubGlobal("navigator", {
    clipboard: { writeText },
    userAgent: "test",
    language: "en",
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AnywhereDialog", () => {
  it("renders nothing while closed", () => {
    render(<AnywhereDialog />)
    expect(screen.queryByText("anywhere.title")).not.toBeInTheDocument()
  })

  it("shows the tagline and an enable button when the server is off", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    expect(await screen.findByText("anywhere.tagline")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "anywhere.enable" })).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "anywhere.qrLabel" })).not.toBeInTheDocument()
  })

  it("enabling the server renders the QR and the stop control", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }))
    expect(anywhereEnable).toHaveBeenCalledOnce()
    expect(await screen.findByRole("img", { name: "anywhere.qrLabel" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "anywhere.stop" })).toBeInTheDocument()
  })

  it("reflects an already-running server, copies the URL, and can stop it", async () => {
    anywhereStatus.mockResolvedValue(info)
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    // The URL button (its label is the URL) appears once status resolves.
    const urlBtn = await screen.findByRole("button", { name: info.url })
    await userEvent.click(urlBtn)
    expect(writeText).toHaveBeenCalledWith(info.url)

    await userEvent.click(screen.getByRole("button", { name: "anywhere.stop" }))
    expect(anywhereDisable).toHaveBeenCalledOnce()
    expect(await screen.findByText("anywhere.tagline")).toBeInTheDocument()
  })

  it("lists the paired devices with when each was last seen", async () => {
    anywhereDevices.mockResolvedValue([device(), device({ id: "d2", name: "iPad" })])
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    expect(await screen.findByText("Matteo's iPhone")).toBeInTheDocument()
    expect(screen.getByText("iPad")).toBeInTheDocument()
    expect(screen.queryByText("anywhere.noDevices")).not.toBeInTheDocument()
  })

  it("says so when nothing is paired", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    expect(await screen.findByText("anywhere.noDevices")).toBeInTheDocument()
  })

  it("revoking one device calls through and refreshes the list", async () => {
    anywhereDevices.mockResolvedValue([device(), device({ id: "d2", name: "iPad" })])
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    await screen.findByText("Matteo's iPhone")
    // Only the revoked one goes; the other device stays paired.
    anywhereDevices.mockResolvedValue([device({ id: "d2", name: "iPad" })])
    // The i18n mock renders every label as its key, so the two revoke buttons
    // are told apart by position: the first row is the first device.
    await userEvent.click(screen.getAllByRole("button", { name: "anywhere.revoke" })[0])
    expect(anywhereRevoke).toHaveBeenCalledWith("d1")
    expect(await screen.findByText("iPad")).toBeInTheDocument()
    expect(screen.queryByText("Matteo's iPhone")).not.toBeInTheDocument()
  })

  it("revoke-all is offered only once more than one phone is paired", async () => {
    anywhereDevices.mockResolvedValue([device()])
    usePalette.setState({ anywhereOpen: true })
    const { rerender } = render(<AnywhereDialog />)
    await screen.findByText("Matteo's iPhone")
    expect(screen.queryByRole("button", { name: "anywhere.revokeAll" })).not.toBeInTheDocument()

    anywhereDevices.mockResolvedValue([device(), device({ id: "d2", name: "iPad" })])
    usePalette.setState({ anywhereOpen: false })
    rerender(<AnywhereDialog />)
    usePalette.setState({ anywhereOpen: true })
    rerender(<AnywhereDialog />)
    await screen.findByText("iPad")
    anywhereDevices.mockResolvedValue([])
    await userEvent.click(screen.getByRole("button", { name: "anywhere.revokeAll" }))
    expect(anywhereRevokeAll).toHaveBeenCalledOnce()
    expect(await screen.findByText("anywhere.noDevices")).toBeInTheDocument()
  })

  it("the device list carries no credential material", async () => {
    anywhereDevices.mockResolvedValue([device()])
    usePalette.setState({ anywhereOpen: true })
    const { container } = render(<AnywhereDialog />)
    await screen.findByText("Matteo's iPhone")
    expect(container.textContent).not.toContain("secret")
  })

  it("pairing another device mints a fresh secret without stopping the server", async () => {
    anywhereStatus.mockResolvedValue(info)
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.pairAnother" }))
    expect(anywhereNewPairing).toHaveBeenCalledOnce()
    expect(anywhereDisable).not.toHaveBeenCalled()
  })

  it("changing a credential lifetime persists both values", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    const idle = await screen.findByDisplayValue("30")
    await userEvent.clear(idle)
    await userEvent.type(idle, "7")
    // The last keystroke wins; both fields are sent so neither is lost.
    expect(anywhereSetLifetimes).toHaveBeenLastCalledWith(7, 90)
  })

  it("toggling mDNS persists it", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByText("anywhere.mdns"))
    expect(anywhereSetMdns).toHaveBeenCalledWith(true)
  })

  it("the footer close button toggles the palette shut", async () => {
    usePalette.setState({ anywhereOpen: true })
    render(<AnywhereDialog />)
    await userEvent.click(await screen.findByRole("button", { name: "common.close" }))
    expect(usePalette.getState().anywhereOpen).toBe(false)
  })
})
