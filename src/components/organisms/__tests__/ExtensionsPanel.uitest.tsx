// UI test: the Extensions panel — both halves of it. The curated language
// servers reflect install status, toggle, and install through the terminal; the
// Open VSX side searches, hides what Reado can't install, and says plainly what
// a partly-supported extension will and won't do. The registry and the PATH
// probe are mocked; the stores are real.

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const lspInstalled = vi.fn<(server: string) => Promise<boolean>>()
/** The panel probes every server in one call now; this keeps the per-id mock as
 *  the readable way to say "this one is installed". */
const lspInstalledAll = async () =>
  Promise.all(LANG_SERVERS.map(async (s) => [s.id, await lspInstalled(s.id)] as [string, boolean]))
const submitToTerminal = vi.fn()
const ovsxSearch = vi.fn()
const ovsxInstall = vi.fn()
const ovsxInstalled = vi.fn(async () => [])
const ovsxUninstall = vi.fn(async () => {})
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ptySpawn: vi.fn(async () => {}),
  ptyKill: vi.fn(async () => {}),
  lspInstalled: (server: string) => lspInstalled(server),
  lspInstalledAll: () => lspInstalledAll(),
  linuxPackageManager: vi.fn(async () => null),
  submitToTerminal: (...a: unknown[]) => submitToTerminal(...a),
  ovsxSearch: (...a: unknown[]) => ovsxSearch(...(a as [])),
  ovsxInstall: (...a: unknown[]) => ovsxInstall(...(a as [])),
  ovsxInstalled: () => ovsxInstalled(),
  ovsxUninstall: (...a: unknown[]) => ovsxUninstall(...(a as [])),
}))

import { ExtensionsPanel } from "@/components/organisms/ExtensionsPanel"
import { useSectionState } from "@/components/organisms/extensions/Section"
import { forgetServerProbe } from "@/components/organisms/extensions/useCurated"
import type { ExtListing, ExtManifest } from "@/lib/api"
import { LANG_SERVERS, useExtensions } from "@/lib/extensions"
import { useMarketplace } from "@/lib/marketplace"
import { useSettings, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** A catalogue entry, defaulting to a pure theme extension. */
const listing = (over: Partial<ExtListing> & { manifest?: ExtManifest | null }): ExtListing => ({
  id: "Pub.thing",
  namespace: "Pub",
  name: "thing",
  version: "1.0.0",
  displayName: "Thing",
  description: "A thing.",
  downloadCount: 1234,
  verified: false,
  icon: null,
  manifest: { contributes: { themes: [{ label: "T", path: "./t.json" }] } },
  ...over,
})

const TS = "TypeScript / JavaScript / React"

function tsRow() {
  return within(screen.getByText(TS).closest("li") as HTMLElement)
}

/** The rows inside one section, by its title. Ark marks the trigger and the
 *  content it controls, so the section's body is found through that link. */
function section(title: string) {
  const trigger = screen.getByText(title).closest("button") as HTMLElement
  const id = trigger.getAttribute("aria-controls") as string
  return within(document.getElementById(id) as HTMLElement)
}

beforeEach(() => {
  // The PATH probe is shared across mounts; each test starts from cold.
  forgetServerProbe()
  lspInstalled.mockReset()
  submitToTerminal.mockReset()
  lspInstalled.mockResolvedValue(false)
  useExtensions.setState({ disabled: [] })
  useTerminals.setState({ sessions: [], activeId: null, groups: [], activeGroupId: null })
  ovsxSearch.mockReset()
  ovsxInstall.mockReset()
  ovsxSearch.mockResolvedValue({ items: [], total: 0 })
  ovsxInstalled.mockResolvedValue([])
  useMarketplace.setState({ installed: [], busy: [], loaded: true, reloadNeeded: false })
  // Sections remember whether they were left open; each test starts from the
  // defaults rather than from whatever the previous one arranged.
  useWorkspace.setState({ readingExtension: null })
  localStorage.removeItem("reado.extensionSections")
  useSectionState.setState({ open: {} })
})

/** Open a collapsed section by its header. Formatters and language servers
 *  start closed: the panel is a narrow column and the resting view is what you
 *  already have, not two catalogues to scroll past. */
async function toggleSection(title: string) {
  await userEvent.click(screen.getByText(title).closest("button") as HTMLElement)
}

/** Pick a filter from the Show menu. */
async function show(labelKey: string) {
  await userEvent.click(screen.getByLabelText("ext.filterLabel"))
  await userEvent.click(await screen.findByText(labelKey))
}

/** Uninstalled language servers wait behind their own filter now, so a test
 *  that wants one has to ask for it the way a reader would. */
const showLanguages = () => show("ext.filterLanguages")

/** Type a query and let the panel's debounce elapse. */
async function search(query: string) {
  await userEvent.type(screen.getByPlaceholderText("ext.searchPlaceholder"), query)
  await waitFor(() => expect(ovsxSearch).toHaveBeenCalled())
}

describe("ExtensionsPanel", () => {
  it("puts everything installed in one list, whatever kind it is", async () => {
    // An extension from the registry, a language server on PATH and a formatter
    // the project declares are three different mechanisms and one idea.
    lspInstalled.mockImplementation(async (id) => id === "typescript")
    ovsxInstalled.mockResolvedValue([
      {
        id: "Pub.dusk",
        namespace: "Pub",
        name: "dusk",
        version: "1.0.0",
        displayName: "Dusk",
        manifest: { contributes: { themes: [{}] } },
      },
    ] as never)
    render(<ExtensionsPanel />)
    const installed = await screen.findByText("ext.installedSection")
    expect(installed).toBeInTheDocument()
    await waitFor(() => expect(section("ext.installedSection").getByText(TS)).toBeInTheDocument())
    expect(section("ext.installedSection").getByText("Dusk")).toBeInTheDocument()
  })

  it("suggests registry extensions while browsing", async () => {
    ovsxSearch.mockResolvedValue({ items: [listing({ displayName: "Dracula" })], total: 1 })
    render(<ExtensionsPanel />)
    expect(await screen.findByText("Dracula")).toBeInTheDocument()
  })

  it("offers Reado's own tools first under their filter", async () => {
    ovsxSearch.mockResolvedValue({ items: [], total: 0 })
    render(<ExtensionsPanel />)
    await showLanguages()
    expect((await waitFor(() => section("ext.suggested"))).getByText(TS)).toBeInTheDocument()
  })

  it("browses the registry without being asked for a name", async () => {
    // You can't search for a theme whose name you don't know yet.
    ovsxSearch.mockResolvedValue({ items: [listing({ displayName: "Popular Theme" })], total: 1 })
    render(<ExtensionsPanel />)
    expect(await screen.findByText("Popular Theme")).toBeInTheDocument()
    // Browsing asks the registry for the most-installed, not for a query.
    expect(ovsxSearch).toHaveBeenCalledWith("", expect.any(String), 0, 20, "downloads")
  })

  it("installs a curated tool without touching the user's terminal", async () => {
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() => expect(lspInstalled).toHaveBeenCalled())
    await userEvent.click(tsRow().getByRole("button", { name: "ext.install" }))
    // The install runs in a shell of Reado's own — the panel never opens.
    await waitFor(() => expect(submitToTerminal).toHaveBeenCalled())
    expect(submitToTerminal.mock.calls[0][1]).toContain("typescript-language-server")
    expect(useTerminals.getState().open).toBe(false)
  })

  it("installs a registry extension in place", async () => {
    const item = listing({ displayName: "Dracula" })
    ovsxSearch.mockResolvedValue({ items: [item], total: 1 })
    ovsxInstall.mockResolvedValue({ ...item, manifest: item.manifest })
    render(<ExtensionsPanel />)
    const row = within((await screen.findByText("Dracula")).closest("li") as HTMLElement)
    await userEvent.click(row.getByRole("button", { name: "ext.install" }))
    await waitFor(() => expect(ovsxInstall).toHaveBeenCalledWith("Pub", "thing", "1.0.0"))
  })

  it("offers no enable control on something you haven't installed", async () => {
    // Switching on what you don't have is a preference about nothing — and as a
    // checkbox it sat there ticked on every row in the catalogue, saying it.
    lspInstalled.mockResolvedValue(false)
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() => expect(screen.getByText(TS)).toBeInTheDocument())
    expect(tsRow().queryByRole("button", { name: "ext.disable" })).not.toBeInTheDocument()
  })

  it("disables an installed curated tool from its own row, and asks for a reload", async () => {
    // A language server is a running process: switching it off is invisible
    // until the window is rebuilt, so the prompt has to appear.
    lspInstalled.mockImplementation(async (id) => id === "typescript")
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() =>
      expect(tsRow().queryByRole("button", { name: "ext.disable" })).toBeInTheDocument(),
    )
    await userEvent.click(tsRow().getByRole("button", { name: "ext.disable" }))
    expect(useExtensions.getState().disabled).toContain("typescript")
    expect(await screen.findByRole("button", { name: "ext.reload" })).toBeInTheDocument()
  })

  it("says nothing about reloading until something needs one", async () => {
    // Saying it every time trains the reader to ignore it.
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() => expect(screen.getByText(TS)).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: "ext.reload" })).not.toBeInTheDocument()
  })

  it("re-checks what the user installed outside Reado", async () => {
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() => expect(lspInstalled).toHaveBeenCalled())
    const before = lspInstalled.mock.calls.length
    await userEvent.click(screen.getByRole("button", { name: "ext.recheck" }))
    await waitFor(() => expect(lspInstalled.mock.calls.length).toBeGreaterThan(before))
  })
})

describe("ExtensionsPanel — what it will and won't install", () => {
  it("never lists an extension it cannot install", async () => {
    ovsxSearch.mockResolvedValue({
      items: [
        listing({ id: "A.code", displayName: "Code Only", manifest: { main: "./x.js" } }),
        listing({ id: "B.theme", displayName: "Just A Theme" }),
      ],
      total: 2,
    })
    render(<ExtensionsPanel />)
    expect(await screen.findByText("Just A Theme")).toBeInTheDocument()
    expect(screen.queryByText("Code Only")).not.toBeInTheDocument()
  })

  it("never lists an extension that only half works here", async () => {
    // An icon theme whose icons Reado could read, behind code it won't run. It
    // is absent rather than present-with-a-footnote: if it is installable, it
    // works.
    ovsxSearch.mockResolvedValue({
      items: [
        listing({
          displayName: "Icons",
          manifest: { main: "./x.js", contributes: { iconThemes: [{}] } },
        }),
      ],
      total: 1,
    })
    render(<ExtensionsPanel />)
    await search("icons")
    expect(await screen.findByText("ext.noResults")).toBeInTheDocument()
    expect(screen.queryByText("Icons")).not.toBeInTheDocument()
  })

  it("keeps the installed list usable when the registry can't be reached", async () => {
    ovsxSearch.mockRejectedValue(new Error("offline"))
    render(<ExtensionsPanel />)
    await search("anything")
    expect(await screen.findByText("ext.searchFailed")).toBeInTheDocument()
  })
})

describe("ExtensionsPanel — filtering and folding", () => {
  it("keeps the browse view about what this project might want", async () => {
    // Browsing "Everything" used to lead with ~41 uninstalled formatters and
    // language servers in source order, so the first ten buttons on screen were
    // the ones that take over your terminal.
    ovsxSearch.mockResolvedValue({ items: [], total: 0 })
    render(<ExtensionsPanel />)
    await waitFor(() => expect(screen.getByText("ext.suggested")).toBeInTheDocument())
    expect(screen.queryByText(TS)).not.toBeInTheDocument()
    await showLanguages()
    expect(await screen.findByText(TS)).toBeInTheDocument()
  })

  it("narrows the whole list, not just the query", async () => {
    // The complaint this fixes: picking a filter changed the control's state and
    // nothing on screen.
    ovsxSearch.mockResolvedValue({ items: [], total: 0 })
    render(<ExtensionsPanel />)
    await showLanguages()
    await waitFor(() => expect(screen.getByText(TS)).toBeInTheDocument())

    await show("ext.filterFormatters")
    await waitFor(() => expect(screen.queryByText(TS)).not.toBeInTheDocument())
    expect(screen.getByText("Prettier")).toBeInTheDocument()
  })

  it("folds a section away and remembers it", async () => {
    ovsxInstalled.mockResolvedValue([
      {
        id: "Pub.dusk",
        namespace: "Pub",
        name: "dusk",
        version: "1.0.0",
        displayName: "Dusk",
        manifest: { contributes: { themes: [{}] } },
      },
    ] as never)
    const { unmount } = render(<ExtensionsPanel />)
    expect(await screen.findByText("Dusk")).toBeVisible()

    await toggleSection("ext.installedSection")
    expect(screen.queryByRole("heading", { name: "Dusk" })).not.toBeInTheDocument()

    // The shape you arrange once is the shape you get back.
    unmount()
    render(<ExtensionsPanel />)
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Dusk" })).not.toBeInTheDocument(),
    )
  })

  it("unfolds while searching, so a match can't hide inside a fold", async () => {
    useSectionState.setState({ open: { installed: false, available: false } })
    ovsxSearch.mockResolvedValue({ items: [], total: 0 })
    render(<ExtensionsPanel />)
    await search("python")
    expect(screen.getByRole("button", { name: "Python" })).toBeVisible()
  })

  it("offers to turn on what an installed extension contributes", async () => {
    // Installing a theme and having nothing happen is the sharpest edge here.
    ovsxInstalled.mockResolvedValue([
      {
        id: "Pub.dusk",
        namespace: "Pub",
        name: "dusk",
        version: "1.0.0",
        displayName: "Dusk",
        manifest: { contributes: { themes: [{ label: "Dusk", path: "./t.json" }] } },
      },
    ] as never)
    render(<ExtensionsPanel />)
    await userEvent.click(await screen.findByRole("button", { name: "ext.use" }))
    expect(useSettings.getState().theme).toBe("ext:Pub.dusk:Dusk")
    expect(useSettings.getState().mode).toBe("manual")
    expect(screen.getByText("ext.inUse")).toBeInTheDocument()
  })
})

describe("ExtensionsPanel — reading an extension before taking it", () => {
  it("opens an extension's own page from its name", async () => {
    // A row holds two lines of blurb; what decides whether you want an
    // extension is its README, and until now reading one meant leaving the app.
    ovsxSearch.mockResolvedValue({ items: [listing({ displayName: "Dracula" })], total: 1 })
    render(<ExtensionsPanel />)
    await userEvent.click(await screen.findByRole("button", { name: "Dracula" }))
    expect(useWorkspace.getState().readingExtension).toMatchObject({
      kind: "registry",
      namespace: "Pub",
      name: "thing",
      version: "1.0.0",
    })
  })

  it("carries the listing along, so the page can offer Install", async () => {
    ovsxSearch.mockResolvedValue({ items: [listing({ displayName: "Dracula" })], total: 1 })
    render(<ExtensionsPanel />)
    await userEvent.click(await screen.findByRole("button", { name: "Dracula" }))
    const reading = useWorkspace.getState().readingExtension
    expect(reading?.kind === "registry" && reading.listing?.displayName).toBe("Dracula")
  })

  it("opens a curated tool's page too, installed or not", async () => {
    // A list where only some rows respond to a click reads as broken, not as
    // principled — and the row you reach for first is usually one of these.
    render(<ExtensionsPanel />)
    await showLanguages()
    await userEvent.click(await screen.findByRole("button", { name: TS }))
    expect(useWorkspace.getState().readingExtension).toEqual({
      kind: "curated",
      id: "typescript",
    })
  })
})
