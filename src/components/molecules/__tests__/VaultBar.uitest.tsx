// UI test: the browser pane's credential strip. The vault itself is the user's own
// CLI, mocked here; what's asserted is that a secret is fetched only when asked
// for, filled through the page, registered for redaction — and that an unreadable
// form says so instead of failing quietly.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VaultItem, VaultStatus } from "@/lib/vault"

const api = {
  vaultStatus: vi.fn<() => Promise<VaultStatus>>(async () => ({ backend: "bw", locked: false })),
  vaultLookup: vi.fn<(url: string) => Promise<VaultItem[]>>(async () => [
    { id: "i1", title: "Example", username: "me@example.com", hasOtp: true },
  ]),
  vaultSecret: vi.fn<(id: string) => Promise<string>>(async () => "s3cr3t!"),
  vaultOtp: vi.fn<(id: string) => Promise<string>>(async () => "482915"),
  vaultUnlock: vi.fn<(password: string) => Promise<void>>(async () => {}),
  vaultCreate: vi.fn<(u: string, t: string, n: string) => Promise<string>>(
    async () => "gen3rated!",
  ),
}
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  vaultStatus: () => api.vaultStatus(),
  vaultLookup: (u: string) => api.vaultLookup(u),
  vaultSecret: (id: string) => api.vaultSecret(id),
  vaultOtp: (id: string) => api.vaultOtp(id),
  vaultUnlock: (p: string) => api.vaultUnlock(p),
  vaultCreate: (u: string, t: string, n: string) => api.vaultCreate(u, t, n),
}))

import { VaultBar } from "@/components/molecules/VaultBar"
import { usePreview } from "@/lib/preview"
import { useWorkspace } from "@/lib/store"

const URL_ = "https://example.com/login"

/** The script from the most recent page evaluation. */
const last = (fn: ReturnType<typeof page>) => fn.mock.calls[fn.mock.calls.length - 1]?.[0]

/** A page that accepts whatever is filled, unless told to report a missing field. */
const page = (result: unknown = { ok: true }) =>
  vi.fn<(js: string) => Promise<string>>(async () => JSON.stringify(result))

beforeEach(() => {
  vi.clearAllMocks()
  api.vaultStatus.mockResolvedValue({ backend: "bw", locked: false })
  api.vaultLookup.mockResolvedValue([
    { id: "i1", title: "Example", username: "me@example.com", hasOtp: true },
  ])
  usePreview.setState({ secrets: [] })
  useWorkspace.setState({ tool: "files" })
})
afterEach(() => vi.restoreAllMocks())

describe("the credential strip", () => {
  it("says which CLI to install when there is no password manager", async () => {
    api.vaultStatus.mockResolvedValue({ backend: null, locked: false })
    render(<VaultBar url={URL_} evalInPage={page()} onClose={() => {}} />)
    expect(await screen.findByText(/vault.noBackend/)).toBeTruthy()
    expect(api.vaultLookup).not.toHaveBeenCalled()
    // …and points at where the CLI is listed, rather than leaving a dead end.
    await userEvent.click(screen.getByText("vault.openExtensions"))
    expect(useWorkspace.getState().tool).toBe("extensions")
  })

  it("fetches the password only when the user picks the item, and fills it", async () => {
    const evalInPage = page()
    render(<VaultBar url={URL_} evalInPage={evalInPage} onClose={() => {}} />)
    const item = await screen.findByText("Example")
    expect(api.vaultSecret).not.toHaveBeenCalled() // listing carries no secret
    await userEvent.click(item)
    await waitFor(() => expect(api.vaultSecret).toHaveBeenCalledWith("i1"))
    const script = last(evalInPage) as string
    expect(script).toContain("me@example.com")
    expect(script).toContain("s3cr3t!")
  })

  it("registers what it filled so it can be redacted from the agent's view", async () => {
    render(<VaultBar url={URL_} evalInPage={page()} onClose={() => {}} />)
    await userEvent.click(await screen.findByText("Example"))
    await waitFor(() => expect(usePreview.getState().secrets).toContain("s3cr3t!"))
  })

  it("reports a form it could not read instead of failing quietly", async () => {
    render(
      <VaultBar
        url={URL_}
        evalInPage={page({ ok: false, missing: "username" })}
        onClose={() => {}}
      />,
    )
    await userEvent.click(await screen.findByText("Example"))
    expect(await screen.findByText("vault.missing.username")).toBeTruthy()
    expect(usePreview.getState().secrets).toEqual([])
  })

  it("fills a one-time code on its own action", async () => {
    const evalInPage = page()
    render(<VaultBar url={URL_} evalInPage={evalInPage} onClose={() => {}} />)
    await userEvent.click(await screen.findByText("vault.otp"))
    await waitFor(() => expect(api.vaultOtp).toHaveBeenCalledWith("i1"))
    expect(last(evalInPage)).toContain("482915")
  })

  it("saves a generated credential for the page and fills it", async () => {
    const evalInPage = page()
    render(<VaultBar url={URL_} evalInPage={evalInPage} onClose={() => {}} />)
    await userEvent.click(await screen.findByText("vault.create"))
    await waitFor(() => expect(api.vaultCreate).toHaveBeenCalled())
    expect(api.vaultCreate.mock.calls[0][0]).toBe(URL_)
    expect(api.vaultCreate.mock.calls[0][1]).toBe("example.com")
    expect(last(evalInPage)).toContain("gen3rated!")
  })

  it("surfaces a failed save rather than leaving a credential nowhere", async () => {
    api.vaultCreate.mockRejectedValueOnce(new Error("vault refused"))
    render(<VaultBar url={URL_} evalInPage={page()} onClose={() => {}} />)
    await userEvent.click(await screen.findByText("vault.create"))
    expect(await screen.findByText(/vault refused/)).toBeTruthy()
  })

  it("asks for the unlock before listing anything", async () => {
    api.vaultStatus.mockResolvedValue({ backend: "bw", locked: true })
    render(<VaultBar url={URL_} evalInPage={page()} onClose={() => {}} />)
    const field = await screen.findByLabelText("vault.masterPassword")
    expect(api.vaultLookup).not.toHaveBeenCalled()
    api.vaultStatus.mockResolvedValue({ backend: "bw", locked: false })
    await userEvent.type(field, "master{Enter}")
    await waitFor(() => expect(api.vaultUnlock).toHaveBeenCalledWith("master"))
    await waitFor(() => expect(api.vaultLookup).toHaveBeenCalledWith(URL_))
  })
})
