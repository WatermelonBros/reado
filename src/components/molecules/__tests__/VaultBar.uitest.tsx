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
  usePreview.setState({ secrets: [], vaultPick: null })
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

  it("asks the vault once per site, not once per page of a sign-in", async () => {
    // A sign-in walks email → password → 2FA on one host. The vault matches by
    // host, so each of those asks the same question — and every ask spawns one
    // password-manager CLI process per stored login, each of which makes macOS
    // ask whether Reado may read another app's data.
    const { rerender } = render(
      <VaultBar url="https://example.com/login" evalInPage={page()} onClose={() => {}} />,
    )
    await waitFor(() => expect(api.vaultLookup).toHaveBeenCalledTimes(1))
    rerender(<VaultBar url="https://example.com/password" evalInPage={page()} onClose={() => {}} />)
    rerender(
      <VaultBar url="https://example.com/2fa?step=3" evalInPage={page()} onClose={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText("Example")).toBeTruthy())
    expect(api.vaultLookup).toHaveBeenCalledTimes(1)
    // It is asked about the site, not the page that happened to be open.
    expect(api.vaultLookup).toHaveBeenCalledWith("https://example.com")

    // A genuinely different site is a different question, and is asked.
    rerender(<VaultBar url="https://other.example/login" evalInPage={page()} onClose={() => {}} />)
    await waitFor(() => expect(api.vaultLookup).toHaveBeenCalledTimes(2))
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

  it("stays open after filling, so the one-time code is still reachable", async () => {
    // It used to close itself the instant the password landed — which took the
    // second half of the login with it: the site asks for the code next.
    const onClose = vi.fn()
    render(<VaultBar url={URL_} evalInPage={page()} onClose={onClose} />)
    await userEvent.click(await screen.findByText("Example"))
    await waitFor(() => expect(api.vaultSecret).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText("vault.otp")).toBeTruthy()
    // And it says what it did, rather than leaving the user guessing.
    expect(await screen.findByText("vault.filledThenOtp")).toBeTruthy()
  })

  describe("the in-page chip", () => {
    /** A page whose bridge is there: the chip draws, everything else fills. */
    const withBridge = () =>
      vi.fn<(js: string) => Promise<string>>(async (js) =>
        js.includes("__readoBridge.vault(") ? "true" : JSON.stringify({ ok: true }),
      )

    it("draws over the page and drops the strip, which is what it replaces", async () => {
      const evalInPage = withBridge()
      const { container } = render(
        <VaultBar url={URL_} evalInPage={evalInPage} onClose={() => {}} />,
      )
      await waitFor(() => expect(container).toBeEmptyDOMElement())
      const drawn = evalInPage.mock.calls.map((c) => c[0]).find((js) => js.includes(".vault("))
      expect(drawn).toContain("Example")
      // Titles and usernames go into the page; a secret never does.
      expect(drawn).not.toContain("s3cr3t!")
    })

    it("fills from a pick made in the page", async () => {
      const evalInPage = withBridge()
      render(<VaultBar url={URL_} evalInPage={evalInPage} onClose={() => {}} />)
      await waitFor(() => expect(api.vaultLookup).toHaveBeenCalled())
      usePreview.getState().setVaultPick({ kind: "login", id: "i1" })
      await waitFor(() => expect(api.vaultSecret).toHaveBeenCalledWith("i1"))
      // Consumed, so a re-render can't fetch the credential a second time.
      expect(usePreview.getState().vaultPick).toBeNull()
      await waitFor(() =>
        expect(evalInPage.mock.calls.some((c) => c[0].includes("s3cr3t!"))).toBe(true),
      )
    })

    it("closes the whole strip when the page's chip is dismissed", async () => {
      const onClose = vi.fn()
      render(<VaultBar url={URL_} evalInPage={withBridge()} onClose={onClose} />)
      await waitFor(() => expect(api.vaultLookup).toHaveBeenCalled())
      usePreview.getState().setVaultPick({ kind: "close" })
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
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
    // The site, not the page — same as the initial lookup (see "once per site").
    await waitFor(() => expect(api.vaultLookup).toHaveBeenCalledWith("https://example.com"))
  })
})
