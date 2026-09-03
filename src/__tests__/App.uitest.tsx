// UI test: the root router — launcher vs workspace, keyed off the project in the
// window's URL hash — plus the app-level wiring it owns (log config, the native
// menu bridge, "open with Reado" targets, and the Anywhere host).
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (e: { payload: unknown }) => void
const listeners = new Map<string, Listener>()
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    listeners.set(event, cb)
    return () => listeners.delete(event)
  }),
}))

const h = vi.hoisted(() => ({ label: "main", setFocus: vi.fn(async () => {}) }))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: h.label,
    setFocus: h.setFocus,
    setTheme: vi.fn(async () => {}),
  }),
}))

const drainOpenTargets = vi.fn(async () => [] as Array<{ root: string; file: string }>)
const anywhereSetRecents = vi.fn<(r: unknown) => Promise<void>>(async () => {})
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  drainOpenTargets: () => drainOpenTargets(),
  anywhereSetRecents: (r: unknown) => anywhereSetRecents(r),
}))

const applyLogConfig = vi.fn()
vi.mock("../lib/logger", async (orig) => ({
  ...(await orig<typeof import("../lib/logger")>()),
  applyLogConfig: (on: boolean, level: string) => applyLogConfig(on, level),
}))

const listenForMenu = vi.fn(async () => () => {})
vi.mock("../lib/menu", () => ({ listenForMenu: () => listenForMenu() }))
const runStartupChecks = vi.fn(() => () => {})
vi.mock("../lib/startup", () => ({ runStartupChecks: () => runStartupChecks() }))

const openPathTarget = vi.fn<(root: string, file: string) => Promise<void>>(async () => {})
const openInNewWindow = vi.fn()
vi.mock("../lib/window", async (orig) => ({
  ...(await orig<typeof import("../lib/window")>()),
  openPathTarget: (root: string, file: string) => openPathTarget(root, file),
  openInNewWindow: (p?: string) => openInNewWindow(p),
}))

// Every child has its own test; here only the routing matters.
vi.mock("../components/pages/ProjectView", () => ({
  ProjectView: ({ root }: { root: string }) => <div data-testid="workspace">{root}</div>,
}))
vi.mock("../components/pages/RecentProjects", () => ({
  RecentProjects: () => <div data-testid="launcher" />,
}))
vi.mock("../components/organisms/TitleBar", () => ({
  TitleBar: ({ projectName }: { projectName: string | null }) => (
    <div data-testid="title-bar">{projectName ?? "none"}</div>
  ),
}))
vi.mock("../components/organisms/Palette", () => ({ Palette: () => null }))
vi.mock("../components/organisms/OnboardingTour", () => ({ OnboardingTour: () => null }))
vi.mock("../components/organisms/UpdatePrompt", () => ({ UpdatePrompt: () => null }))
vi.mock("../components/organisms/Settings", () => ({ Settings: () => null }))
vi.mock("../components/organisms/AnywhereDialog", () => ({ AnywhereDialog: () => null }))
vi.mock("../components/organisms/ShortcutsDialog", () => ({ ShortcutsDialog: () => null }))
vi.mock("../components/organisms/PromptDialog", () => ({ PromptDialog: () => null }))
vi.mock("../components/organisms/SynopsisModal", () => ({ SynopsisModal: () => null }))
vi.mock("../components/organisms/OnboardingModal", () => ({ OnboardingModal: () => null }))
vi.mock("../components/organisms/QaModal", () => ({ QaModal: () => null }))
vi.mock("../components/organisms/SemanticModal", () => ({ SemanticModal: () => null }))
vi.mock("../components/organisms/DefaultAppPrompt", () => ({ DefaultAppPrompt: () => null }))
vi.mock("../components/molecules/EditMenu", () => ({ EditMenu: () => null }))
vi.mock("../components/molecules/Notice", () => ({ Notice: () => null }))
vi.mock("../components/atoms/GlobalTooltip", () => ({ GlobalTooltip: () => null }))

import App from "@/App"
import { useRecents, useSettings } from "@/lib/store"

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  h.label = "main"
  window.location.hash = ""
  drainOpenTargets.mockResolvedValue([])
  useRecents.setState({ projects: [] })
  useSettings.setState({ logEnabled: true, logLevel: "info" })
})

describe("routing", () => {
  it("shows the launcher with no project in the hash", () => {
    render(<App />)
    expect(screen.getByTestId("launcher")).toBeInTheDocument()
    expect(screen.getByTestId("title-bar")).toHaveTextContent("none")
  })

  it("shows the workspace for the project in the hash, named in the title bar", () => {
    window.location.hash = `project=${encodeURIComponent("/Users/me/my app")}`
    render(<App />)
    expect(screen.getByTestId("workspace")).toHaveTextContent("/Users/me/my app")
    expect(screen.getByTestId("title-bar")).toHaveTextContent("my app")
  })

  it("follows a hash change without a reload", async () => {
    render(<App />)
    window.location.hash = `project=${encodeURIComponent("/repo")}`
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(await screen.findByTestId("workspace")).toHaveTextContent("/repo")
  })

  it("returns to the launcher when the project is closed", async () => {
    window.location.hash = "project=%2Frepo"
    render(<App />)
    window.location.hash = ""
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(await screen.findByTestId("launcher")).toBeInTheDocument()
  })
})

describe("app-level wiring", () => {
  it("runs the startup self-heal and claims focus", async () => {
    render(<App />)
    expect(runStartupChecks).toHaveBeenCalled()
    await waitFor(() => expect(h.setFocus).toHaveBeenCalled())
  })

  it("pushes the logging preference on boot and whenever it changes", () => {
    render(<App />)
    expect(applyLogConfig).toHaveBeenCalledWith(true, "info")
    useSettings.setState({ logLevel: "debug" })
    expect(applyLogConfig).toHaveBeenLastCalledWith(true, "debug")
  })

  it("subscribes to the native menu, and unsubscribes when it goes away", async () => {
    // Routing an id to its command is `lib/menu`'s job and is tested there; what
    // the root owns is the subscription's lifetime.
    const off = vi.fn()
    listenForMenu.mockResolvedValue(off)
    const { unmount } = render(<App />)
    expect(listenForMenu).toHaveBeenCalled()
    unmount()
    await waitFor(() => expect(off).toHaveBeenCalled())
  })
})

describe("'open with Reado'", () => {
  it("drains the targets queued before the window existed", async () => {
    drainOpenTargets.mockResolvedValue([{ root: "/repo", file: "src/a.ts" }])
    render(<App />)
    await waitFor(() => expect(openPathTarget).toHaveBeenCalledWith("/repo", "src/a.ts"))
  })

  it("opens ones that arrive while running", async () => {
    render(<App />)
    await waitFor(() => expect(listeners.has("reado://open-path")).toBe(true))
    listeners.get("reado://open-path")?.({ payload: { root: "/repo", file: "b.ts" } })
    expect(openPathTarget).toHaveBeenCalledWith("/repo", "b.ts")
  })

  it("is the main window's job alone", async () => {
    h.label = "project_123"
    render(<App />)
    await Promise.resolve()
    expect(drainOpenTargets).not.toHaveBeenCalled()
  })
})

describe("the Reado Anywhere host", () => {
  it("publishes the recents list, and republishes when it changes", async () => {
    useRecents.setState({ projects: [{ path: "/repo", name: "repo" }] as never })
    render(<App />)
    await waitFor(() =>
      expect(anywhereSetRecents).toHaveBeenCalledWith([{ path: "/repo", name: "repo" }]),
    )
    anywhereSetRecents.mockClear()
    useRecents.setState({ projects: [{ path: "/other", name: "other" }] as never })
    expect(anywhereSetRecents).toHaveBeenCalledWith([{ path: "/other", name: "other" }])
  })

  it("opens a window when a phone asks for a project", async () => {
    render(<App />)
    await waitFor(() => expect(listeners.has("anywhere://open-project")).toBe(true))
    listeners.get("anywhere://open-project")?.({ payload: "/repo" })
    expect(openInNewWindow).toHaveBeenCalledWith("/repo")
  })

  it("doesn't run in a project window", async () => {
    h.label = "project_123"
    render(<App />)
    await Promise.resolve()
    expect(anywhereSetRecents).not.toHaveBeenCalled()
  })
})
