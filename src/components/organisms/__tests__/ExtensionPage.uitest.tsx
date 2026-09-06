/**
 * The extension page: the README, and the actions that make sense for the state
 * the extension is actually in. It answers the question a sidebar row can't —
 * "is this the one I want?" — so a failure to load has to say why rather than
 * leave a blank pane.
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ovsxReadme = vi.fn()
const ovsxUninstall = vi.fn(async () => {})
const ovsxInstall = vi.fn()
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ovsxReadme: (...a: unknown[]) => ovsxReadme(...(a as [])),
  ovsxUninstall: (...a: unknown[]) => ovsxUninstall(...(a as [])),
  ovsxInstall: (...a: unknown[]) => ovsxInstall(...(a as [])),
  lspInstalled: vi.fn(async () => false),
  lspInstalledAll: vi.fn(async () => []),
  formatterStatus: vi.fn(async () => []),
  linuxPackageManager: vi.fn(async () => null),
  submitToTerminal: vi.fn(),
}))

import { ExtensionPage } from "@/components/organisms/ExtensionPage"
import { forgetServerProbe } from "@/components/organisms/extensions/useCurated"
import type { InstalledExt } from "@/lib/api"
import { useExtensions } from "@/lib/extensions"
import { useMarketplace } from "@/lib/marketplace"
import { type ReadingExtension, useWorkspace } from "@/lib/store"

const dusk: InstalledExt = {
  id: "Pub.dusk",
  namespace: "Pub",
  name: "dusk",
  version: "1.0.0",
  displayName: "Dusk",
  manifest: { contributes: { themes: [{ label: "Dusk", path: "./t.json" }] } },
}

beforeEach(() => {
  // The PATH probe is shared across mounts; each test starts from cold.
  forgetServerProbe()
  ovsxReadme.mockReset()
  ovsxUninstall.mockReset()
  ovsxReadme.mockResolvedValue("# Dusk\n\nA calm theme.")
  useWorkspace.setState({ readingExtension: null })
  useMarketplace.setState({ installed: [], busy: [], loaded: true, reloadNeeded: false })
  useExtensions.setState({ disabled: [] })
})

const open = (ext: ReadingExtension) => useWorkspace.setState({ readingExtension: ext })

describe("ExtensionPage", () => {
  it("shows nothing at all until an extension is being read", () => {
    const { container } = render(<ExtensionPage />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders the README of a registry extension", async () => {
    open({ kind: "registry", namespace: "Pub", name: "dusk", version: "1.0.0" })
    render(<ExtensionPage />)
    expect(await screen.findByText("A calm theme.")).toBeInTheDocument()
    expect(ovsxReadme).toHaveBeenCalledWith("Pub", "dusk", "1.0.0")
  })

  it("says why the README didn't load, not just that it didn't", async () => {
    // "No README published" and "the registry is unreachable" want different
    // things from the reader.
    ovsxReadme.mockRejectedValue(new Error("This extension has no README."))
    open({ kind: "registry", namespace: "Pub", name: "dusk" })
    render(<ExtensionPage />)
    expect(await screen.findByText(/has no README/)).toBeInTheDocument()
  })

  it("offers Install for something you don't have", async () => {
    open({
      kind: "registry",
      namespace: "Pub",
      name: "dusk",
      version: "1.0.0",
      listing: {
        id: "Pub.dusk",
        namespace: "Pub",
        name: "dusk",
        version: "1.0.0",
        displayName: "Dusk",
        description: "",
        downloadCount: 10,
        verified: true,
        icon: null,
        manifest: dusk.manifest,
      },
    })
    render(<ExtensionPage />)
    expect(await screen.findByRole("button", { name: "ext.install" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "ext.uninstall" })).not.toBeInTheDocument()
  })

  it("offers Use, Disable and Remove for something you have", async () => {
    useMarketplace.setState({ installed: [dusk] })
    open({ kind: "registry", namespace: "Pub", name: "dusk", version: "1.0.0" })
    render(<ExtensionPage />)
    expect(await screen.findByRole("button", { name: "ext.use" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "ext.disable" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "ext.uninstall" })).toBeInTheDocument()
  })

  it("removes an extension and closes the page behind it", async () => {
    useMarketplace.setState({ installed: [dusk] })
    open({ kind: "registry", namespace: "Pub", name: "dusk", version: "1.0.0" })
    render(<ExtensionPage />)
    await userEvent.click(await screen.findByRole("button", { name: "ext.uninstall" }))
    await waitFor(() => expect(ovsxUninstall).toHaveBeenCalledWith("Pub", "dusk"))
    await waitFor(() => expect(useWorkspace.getState().readingExtension).toBeNull())
  })

  it("closes on Escape", async () => {
    open({ kind: "registry", namespace: "Pub", name: "dusk" })
    render(<ExtensionPage />)
    await screen.findByText("A calm theme.")
    await userEvent.keyboard("{Escape}")
    expect(useWorkspace.getState().readingExtension).toBeNull()
  })
})

describe("ExtensionPage — one of Reado's own", () => {
  it("shows what a formatter adds, how it's declared, and the exact command", async () => {
    open({ kind: "curated", id: "prettier" })
    render(<ExtensionPage />)
    expect(await screen.findByText("Prettier")).toBeInTheDocument()
    expect(screen.getByText(/npm install --save-dev prettier/)).toBeInTheDocument()
    // Its README is never fetched: it isn't a package.
    expect(ovsxReadme).not.toHaveBeenCalled()
  })

  it("shows a language server's page too", async () => {
    open({ kind: "curated", id: "rust" })
    render(<ExtensionPage />)
    expect(await screen.findByText("Rust")).toBeInTheDocument()
  })

  it("shows nothing for an id that names neither", () => {
    open({ kind: "curated", id: "not-a-tool" })
    const { container } = render(<ExtensionPage />)
    expect(container).toBeEmptyDOMElement()
  })
})
