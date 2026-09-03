// UI test: the workspace shell — what it loads on open, how it reacts to the
// backend's file/comment/git events, and the layout it lays out (activity bar,
// sidebar, split pane, docks, status bar). The children are stubbed; the stores
// are real, so what's asserted is the wiring.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (e: { payload: unknown }) => void
const listeners = new Map<string, Listener>()
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    listeners.set(event, cb)
    return () => listeners.delete(event)
  }),
}))
// Opening a project fires a dozen store loads straight at the backend; answer
// them with an empty result so none of them rejects into the test run.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main", setTitle: vi.fn(async () => {}) }),
}))

const api = {
  gitInfo: vi.fn(async (..._a: unknown[]) => ({ isRepo: true, branch: "main", changedFiles: 0 })),
  listFiles: vi.fn(async (..._a: unknown[]) => ["src/a.ts", "src/b.ts"]),
  rebuildIndex: vi.fn(async (..._a: unknown[]) => {}),
  semanticRebuild: vi.fn(async (..._a: unknown[]) => 0),
  semanticReindexFile: vi.fn(async (..._a: unknown[]) => {}),
  startWatching: vi.fn(async (..._a: unknown[]) => {}),
  reanchorFile: vi.fn(async (..._a: unknown[]) => []),
  readFile: vi.fn(async (..._a: unknown[]) => ({ kind: "text", text: "" })),
  anywhereSetProject: vi.fn(async (..._a: unknown[]) => {}),
  anywhereClearProject: vi.fn(async (..._a: unknown[]) => {}),
  previewClose: vi.fn(async () => {}),
  ptyWrite: vi.fn(async (..._a: unknown[]) => {}),
}
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitInfo: (...a: unknown[]) => api.gitInfo(...(a as [])),
  listFiles: (...a: unknown[]) => api.listFiles(...(a as [])),
  rebuildIndex: (...a: unknown[]) => api.rebuildIndex(...(a as [])),
  semanticRebuild: (...a: unknown[]) => api.semanticRebuild(...(a as [])),
  semanticReindexFile: (...a: unknown[]) => api.semanticReindexFile(...(a as [])),
  startWatching: (...a: unknown[]) => api.startWatching(...(a as [])),
  reanchorFile: (...a: unknown[]) => api.reanchorFile(...(a as [])),
  readFile: (...a: unknown[]) => api.readFile(...(a as [])),
  anywhereSetProject: (...a: unknown[]) => api.anywhereSetProject(...(a as [])),
  anywhereClearProject: (...a: unknown[]) => api.anywhereClearProject(...(a as [])),
  previewClose: () => api.previewClose(),
  ptyWrite: (...a: unknown[]) => api.ptyWrite(...(a as [])),
}))

const dispatchToAgent = vi.fn(async (_p: string) => true)
vi.mock("../../../lib/agents", async (orig) => ({
  ...(await orig<typeof import("../../../lib/agents")>()),
  dispatchToAgent: (p: string) => dispatchToAgent(p),
}))
const ensureMcp = vi.fn(async (_r: string) => {})
vi.mock("../../../lib/mcp", () => ({ ensureMcp: (r: string) => ensureMcp(r) }))
const notifyResolved = vi.fn(async (_n: number) => {})
vi.mock("../../../lib/notify", () => ({
  notifyResolved: (n: number) => notifyResolved(n as never),
}))

vi.mock("../../organisms/Editor", () => ({
  Editor: ({ paneFile }: { paneFile?: string }) => (
    <div data-testid={paneFile ? "split-editor" : "editor"}>{paneFile ?? "primary"}</div>
  ),
}))
vi.mock("../../organisms/Tabs", () => ({ Tabs: () => <div data-testid="tabs" /> }))
vi.mock("../../organisms/ActivityBar", () => ({
  ActivityBar: () => <div data-testid="activity-bar" />,
}))
vi.mock("../../organisms/DockRegion", () => ({
  DockRegion: ({ area }: { area: string }) => <div data-testid={`dock-${area}`} />,
}))
vi.mock("../../organisms/ToolPanelBody", async (orig) => ({
  ...(await orig<typeof import("../../organisms/ToolPanelBody")>()),
  ToolPanelBody: ({ tool }: { tool: string }) => <div data-testid="tool-body">{tool}</div>,
}))
vi.mock("../../organisms/KnowledgeGraph", () => ({ KnowledgeGraph: () => <div>graph</div> }))
vi.mock("../../organisms/DocsView", () => ({ DocsView: () => <div>docs</div> }))
vi.mock("../../organisms/ToursPanel", () => ({ TourBar: () => null }))
vi.mock("../../molecules/StatusBar", () => ({ StatusBar: () => <div data-testid="status-bar" /> }))
vi.mock("../../molecules/Breadcrumb", () => ({
  Breadcrumb: () => <div data-testid="breadcrumb" />,
}))
vi.mock("../../molecules/GitignorePrompt", () => ({ GitignorePrompt: () => null }))

import { ProjectView } from "@/components/pages/ProjectView"
import { useComments } from "@/lib/comments"
import { defaultLayout, useLayout } from "@/lib/layout"
import { useReadProgress } from "@/lib/readProgress"
import { useProject, useSessions, useSettings, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

/** Fire a backend event by name. */
const emit = (event: string, payload: unknown = null) => listeners.get(event)?.({ payload })

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  window.location.hash = ""
  useProject.setState({ tabs: [], active: null, splitPath: null, expandedDirs: [] })
  // Opening restores the saved session, so seed it there rather than in the
  // project store (which init() overwrites).
  useSessions.setState({ byRoot: {} })
  useComments.setState({ comments: [] })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
  useWorkspace.setState({ tool: "files", graphOpen: false, docsOpen: false, sidebarWidth: 260 })
  useLayout.setState({
    layout: defaultLayout(),
    hidden: { left: false, right: false, bottom: false },
  })
  useSettings.setState({
    showActivityBar: true,
    showStatusBar: true,
    showBreadcrumbs: true,
    sidebarSide: "left",
    panelAlignment: "center",
    centeredLayout: false,
    restoreSession: true,
    zoom: 1,
  })
})

describe("opening a project", () => {
  it("indexes it, watches it and reads its git state", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.gitInfo).toHaveBeenCalledWith(ROOT))
    expect(api.rebuildIndex).toHaveBeenCalledWith(ROOT)
    expect(api.semanticRebuild).toHaveBeenCalledWith(ROOT)
    expect(api.startWatching).toHaveBeenCalledWith(ROOT)
    expect(api.listFiles).toHaveBeenCalledWith(ROOT)
  })

  it("wires the agent's MCP access", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(ensureMcp).toHaveBeenCalledWith(ROOT))
  })

  it("publishes the project to paired phones, and withdraws it on close", async () => {
    const { unmount } = render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.anywhereSetProject).toHaveBeenCalledWith("main", ROOT, "repo"))
    unmount()
    expect(api.anywhereClearProject).toHaveBeenCalledWith("main")
  })

  it("opens the file an OS association handed us, then drops it from the hash", async () => {
    window.location.hash = `project=${encodeURIComponent(ROOT)}&open=${encodeURIComponent(`${ROOT}/src/a.ts`)}`
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(useProject.getState().active).toBe(`${ROOT}/src/a.ts`))
    expect(window.location.hash).not.toContain("open=")
  })

  it("closes an orphaned preview window left over from a reload", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.previewClose).toHaveBeenCalled())
  })
})

describe("reacting to the backend", () => {
  it("re-anchors a file's comments when it changes on disk", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("file-changed")).toBe(true))
    emit("file-changed", { file: "src/a.ts" })
    await waitFor(() => expect(api.reanchorFile).toHaveBeenCalledWith(ROOT, "src/a.ts"))
    expect(api.semanticReindexFile).toHaveBeenCalledWith(ROOT, "src/a.ts")
  })

  it("flags a read file that changed externally, and marks it unread", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("file-changed")).toBe(true))
    // Opening reloads reading progress from disk, so seed it afterwards.
    useReadProgress.setState({ read: new Set(["src/a.ts"]) })
    emit("file-changed", { file: "src/a.ts" })
    expect(useReadProgress.getState().changed.has("src/a.ts")).toBe(true)
    expect(useReadProgress.getState().read.has("src/a.ts")).toBe(false)
  })

  it("closes the tab of a file deleted on disk", async () => {
    useSessions.setState({
      byRoot: { [ROOT]: { tabs: [`${ROOT}/src/gone.ts`], active: `${ROOT}/src/gone.ts` } },
    })
    api.readFile.mockRejectedValue(new Error("ENOENT"))
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("file-changed")).toBe(true))
    emit("file-changed", { file: "src/gone.ts" })
    await waitFor(() => expect(useProject.getState().tabs).toEqual([]))
  })

  it("coalesces a burst of edits into one tree refresh", async () => {
    vi.useFakeTimers()
    render(<ProjectView root={ROOT} />)
    await vi.waitFor(() => expect(listeners.has("file-changed")).toBe(true))
    const before = useProject.getState().treeNonce
    for (const file of ["a.ts", "b.ts", "c.ts"]) emit("file-changed", { file })
    await vi.advanceTimersByTimeAsync(300)
    expect(useProject.getState().treeNonce).toBe(before + 1)
    vi.useRealTimers()
  })

  it("refreshes git state when the branch changes under it", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("git-changed")).toBe(true))
    api.gitInfo.mockClear()
    emit("git-changed")
    expect(api.gitInfo).toHaveBeenCalledWith(ROOT)
  })

  it("reloads comments when the agent mutates them through the CLI", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("comments-changed")).toBe(true))
    api.rebuildIndex.mockClear()
    emit("comments-changed")
    await waitFor(() => expect(api.rebuildIndex).toHaveBeenCalled())
  })
})

describe("Reado Anywhere requests", () => {
  it("runs the review agent for this project only", async () => {
    useComments.setState({
      comments: [{ id: "c1", kind: "task", state: "open" }],
    } as unknown as Parameters<typeof useComments.setState>[0])
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://run-agent")).toBe(true))
    emit("anywhere://run-agent", "/another/project")
    expect(dispatchToAgent).not.toHaveBeenCalled()
    emit("anywhere://run-agent", ROOT)
    expect(vi.mocked(dispatchToAgent).mock.lastCall?.[0]).toContain("READO REVIEW")
  })

  it("types a phone's keystrokes into the agent's terminal", async () => {
    const { useTerminals } = await import("@/lib/terminals")
    useTerminals.setState({ activeId: "t1", agentTerminals: ["t1"] })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://agent-input")).toBe(true))
    emit("anywhere://agent-input", "yes\r")
    expect(api.ptyWrite).toHaveBeenCalledWith("t1", "yes\r")
  })
})

describe("the workbench layout", () => {
  it("lays out the activity bar, the sidebar, the editor and both docks", () => {
    render(<ProjectView root={ROOT} />)
    expect(screen.getByTestId("activity-bar")).toBeInTheDocument()
    expect(screen.getByTestId("tool-body")).toHaveTextContent("files")
    expect(screen.getByTestId("editor")).toBeInTheDocument()
    expect(screen.getByTestId("dock-right")).toBeInTheDocument()
    expect(screen.getByTestId("dock-bottom")).toBeInTheDocument()
    expect(screen.getByTestId("status-bar")).toBeInTheDocument()
    expect(screen.getByTestId("breadcrumb")).toBeInTheDocument()
  })

  it("honours the chrome toggles", () => {
    useSettings.setState({ showActivityBar: false, showStatusBar: false, showBreadcrumbs: false })
    const { unmount } = render(<ProjectView root={ROOT} />)
    expect(screen.queryByTestId("status-bar")).not.toBeInTheDocument()
    expect(screen.queryByTestId("breadcrumb")).not.toBeInTheDocument()
    // Unpinned, the rail leaves the grid — it only overlays the edge on hover.
    expect(
      (document.querySelector("[data-workbench]") as HTMLElement).style.gridTemplateAreas,
    ).not.toContain("act")
    unmount()

    useSettings.setState({ showActivityBar: true, showStatusBar: true, showBreadcrumbs: true })
    render(<ProjectView root={ROOT} />)
    expect(screen.getByTestId("status-bar")).toBeInTheDocument()
    expect(screen.getByTestId("breadcrumb")).toBeInTheDocument()
    // Pinned, the rail takes a grid column — the unpinned case above only
    // overlays, so presence alone cannot tell the two apart.
    expect(
      (document.querySelector("[data-workbench]") as HTMLElement).style.gridTemplateAreas,
    ).toContain("act")
  })

  it("shows no sidebar when no tool is selected", () => {
    useWorkspace.setState({ tool: null })
    render(<ProjectView root={ROOT} />)
    expect(screen.queryByTestId("tool-body")).not.toBeInTheDocument()
  })

  it("leaves a docked tool to the dock, so it never exists twice", () => {
    useLayout.getState().move("files", "right", { split: true })
    render(<ProjectView root={ROOT} />)
    expect(screen.queryByTestId("tool-body")).not.toBeInTheDocument()
  })

  it("shows the reading progress beside the file tree", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.listFiles).toHaveBeenCalled())
    useReadProgress.setState({ read: new Set(["src/a.ts"]) })
    // The count is three text nodes ("1", "/", "2"), so match the element.
    expect(
      await screen.findByText((_, el) => el?.textContent?.trim().startsWith("1/2") === true),
    ).toBeInTheDocument()
  })

  it("collapses the tree and toggles hidden files", async () => {
    useProject.setState({ expandedDirs: ["src"] })
    render(<ProjectView root={ROOT} />)
    await userEvent.click(screen.getByLabelText("tree.collapseAll"))
    expect(useProject.getState().expandedDirs).toEqual([])
    await userEvent.click(screen.getByLabelText("tree.showHidden"))
    expect(useProject.getState().showHidden).toBe(true)
  })

  it("sends the tool panel to a dock from its header menu", async () => {
    render(<ProjectView root={ROOT} />)
    await userEvent.click(screen.getByTitle("dock.menu"))
    const menu = await screen.findByRole("menu")
    await userEvent.click(within(menu).getByText("dock.moveBottom"))
    expect(
      useLayout.getState().layout.areas.bottom.groups.some((g) => g.tabs.includes("files")),
    ).toBe(true)
  })

  it("resizes the sidebar by dragging its edge, persisting on release", () => {
    const { container } = render(<ProjectView root={ROOT} />)
    const handle = container.querySelector(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(handle)
    fireEvent.pointerMove(window, { clientX: 400 })
    fireEvent.pointerUp(window)
    expect(useWorkspace.getState().sidebarWidth).toBe(400 - 48)
  })
})

describe("the split pane", () => {
  it("appears with its own header, and closes", async () => {
    useSessions.setState({
      byRoot: { [ROOT]: { tabs: [], active: null, split: `${ROOT}/src/b.ts` } },
    })
    render(<ProjectView root={ROOT} />)
    expect(screen.getByTestId("split-editor")).toHaveTextContent("/repo/src/b.ts")
    expect(screen.getByText("src/b.ts")).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("split.close"))
    expect(useProject.getState().splitPath).toBeNull()
  })

  it("isn't there by default", () => {
    render(<ProjectView root={ROOT} />)
    expect(screen.queryByTestId("split-editor")).not.toBeInTheDocument()
  })
})

describe("the overlays", () => {
  it("opens the knowledge graph and the docs viewer on demand", () => {
    useWorkspace.setState({ graphOpen: true, docsOpen: true })
    render(<ProjectView root={ROOT} />)
    expect(screen.getByText("graph")).toBeInTheDocument()
    expect(screen.getByText("docs")).toBeInTheDocument()
  })
})

describe("agent progress", () => {
  it("notifies when the open-task count drops", async () => {
    useComments.setState({
      comments: [
        { id: "c1", kind: "task", state: "open" },
        { id: "c2", kind: "task", state: "open" },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    render(<ProjectView root={ROOT} />)
    useComments.setState({
      comments: [{ id: "c1", kind: "task", state: "open" }],
    } as unknown as Parameters<typeof useComments.setState>[0])
    await waitFor(() => expect(notifyResolved).toHaveBeenCalledWith(1))
  })

  it("stays quiet when a task is added", async () => {
    render(<ProjectView root={ROOT} />)
    useComments.setState({
      comments: [{ id: "c1", kind: "task", state: "open" }],
    } as unknown as Parameters<typeof useComments.setState>[0])
    await Promise.resolve()
    expect(notifyResolved).not.toHaveBeenCalled()
  })
})

describe("the session it restores", () => {
  it("starts clean when the user turned session restore off", async () => {
    useSessions.setState({
      byRoot: { [ROOT]: { tabs: [`${ROOT}/a.ts`], active: `${ROOT}/a.ts` } },
    })
    useSettings.setState({ restoreSession: false })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.gitInfo).toHaveBeenCalled())
    expect(useProject.getState().tabs).toEqual([])
  })

  it("ignores an 'open with' target from another project", async () => {
    window.location.hash = `project=${encodeURIComponent(ROOT)}&open=${encodeURIComponent("/elsewhere/a.ts")}`
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.gitInfo).toHaveBeenCalled())
    expect(useProject.getState().active).toBeNull()
  })
})

describe("the Anywhere review actions", () => {
  const emitReview = (action: string, over: Record<string, unknown> = {}) =>
    emit("anywhere://review-action", {
      root: ROOT,
      id: "s1",
      file: "src/a.ts",
      action,
      objective: null,
      ...over,
    })

  it("runs each one against the guided-review store", async () => {
    const { useGuidedReview } = await import("@/lib/guidedReview")
    const spies = {
      start: vi.fn(async () => null),
      reviewFile: vi.fn(async () => {}),
      respond: vi.fn(async () => {}),
      challenge: vi.fn(async () => {}),
      sendTasks: vi.fn(async () => {}),
    }
    useGuidedReview.setState(spies)
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://review-action")).toBe(true))

    emitReview("start")
    expect(spies.start).toHaveBeenCalledWith(ROOT, { kind: "diff" }, "bug_risk")
    emitReview("start", { objective: "security" })
    expect(spies.start).toHaveBeenLastCalledWith(ROOT, { kind: "diff" }, "security")
    emitReview("file")
    expect(spies.reviewFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    emitReview("respond")
    expect(spies.respond).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    emitReview("challenge")
    expect(spies.challenge).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    emitReview("send")
    expect(spies.sendTasks).toHaveBeenCalledWith(ROOT, "s1")
    emitReview("nonsense")
    // An unknown action must route nowhere rather than falling through.
    expect(spies.reviewFile).toHaveBeenCalledTimes(1)
  })

  it("ignores a request aimed at another project", async () => {
    const { useGuidedReview } = await import("@/lib/guidedReview")
    const reviewFile = vi.fn(async () => {})
    useGuidedReview.setState({ reviewFile })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://review-action")).toBe(true))
    emitReview("file", { root: "/elsewhere" })
    expect(reviewFile).not.toHaveBeenCalled()
  })

  it("runs a pre-review for this project only", async () => {
    const { usePreReview } = await import("@/lib/preReview")
    const generate = vi.fn()
    usePreReview.setState({ generate })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://prereview")).toBe(true))
    emit("anywhere://prereview", "/elsewhere")
    expect(generate).not.toHaveBeenCalled()
    emit("anywhere://prereview", ROOT)
    expect(generate).toHaveBeenCalledWith(ROOT)
  })

  it("drops a phone's keystrokes when no agent terminal is running", async () => {
    const { useTerminals } = await import("@/lib/terminals")
    useTerminals.setState({ activeId: null, agentTerminals: [] })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://agent-input")).toBe(true))
    emit("anywhere://agent-input", "yes\r")
    expect(api.ptyWrite).not.toHaveBeenCalled()
  })

  it("falls back to the first agent pane when the focused one is a shell", async () => {
    const { useTerminals } = await import("@/lib/terminals")
    useTerminals.setState({ activeId: "shell", agentTerminals: ["agent"] })
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(listeners.has("anywhere://agent-input")).toBe(true))
    emit("anywhere://agent-input", "yes\r")
    expect(api.ptyWrite).toHaveBeenCalledWith("agent", "yes\r")
  })
})

describe("more of the workbench", () => {
  it("puts the sidebar and its rail on the right when the setting says so", () => {
    const areas = () =>
      (
        (document.querySelector("[data-workbench]") as HTMLElement).style.gridTemplateAreas.split(
          '"',
        )[1] ?? ""
      ).split(" ")
    const { unmount } = render(<ProjectView root={ROOT} />)
    // Default: rail, then sidebar, then the editor.
    expect(areas().slice(0, 3)).toEqual(["act", "side", "edit"])
    unmount()

    useSettings.setState({ sidebarSide: "right" })
    render(<ProjectView root={ROOT} />)
    // Moved: the editor leads and the pair swaps to the far edge, together.
    expect(areas()[0]).toBe("edit")
    expect(areas().slice(-2)).toEqual(["side", "act"])
  })

  it("overlays the activity bar on hover when it isn't pinned", async () => {
    useSettings.setState({ showActivityBar: false })
    const { container } = render(<ProjectView root={ROOT} />)
    const rail = container.querySelector(".absolute.inset-y-0") as HTMLElement
    expect(rail).toBeTruthy()
    fireEvent.mouseEnter(rail)
    expect(rail.style.transform).toBe("translateX(0)")
    fireEvent.mouseLeave(rail)
    expect(rail.style.transform).not.toBe("translateX(0)")
  })

  it("holds the text to a readable measure when centred layout is on", () => {
    const { container, unmount } = render(<ProjectView root={ROOT} />)
    expect(container.querySelector(".mx-auto.w-full")).toBeNull()
    unmount()

    useSettings.setState({ centeredLayout: true })
    const on = render(<ProjectView root={ROOT} />)
    expect(on.container.querySelector(".mx-auto.w-full")).toBeTruthy()
  })

  it("runs the panel across the editor only, or out to both edges", () => {
    const panelRow = () =>
      (
        (document.querySelector("[data-workbench]") as HTMLElement).style.gridTemplateAreas.split(
          '"',
        )[3] ?? ""
      ).split(" ")
    const { unmount } = render(<ProjectView root={ROOT} />)
    // Centred: the panel covers the editor, and the sidebar keeps its column.
    expect(panelRow()).toContain("side")
    unmount()

    useSettings.setState({ panelAlignment: "justify" })
    render(<ProjectView root={ROOT} />)
    // Justified: everything but the activity bar is panel.
    expect(
      panelRow()
        .filter((a) => a !== "act")
        .every((a) => a === "panel"),
    ).toBe(true)
  })

  it("swaps the split panes", async () => {
    useSessions.setState({ byRoot: { [ROOT]: { tabs: [], active: null, split: `${ROOT}/b.ts` } } })
    render(<ProjectView root={ROOT} />)
    const swapSplit = vi.fn()
    useProject.setState({ swapSplit })
    await userEvent.click(screen.getByLabelText("split.swap"))
    expect(swapSplit).toHaveBeenCalled()
  })

  it("re-lists the tree when the exclude globs change, but not on the first render", async () => {
    render(<ProjectView root={ROOT} />)
    await waitFor(() => expect(api.listFiles).toHaveBeenCalled())
    const before = useProject.getState().treeNonce
    useSettings.setState({ excludeGlobs: ["**/dist/**"] })
    await waitFor(() => expect(useProject.getState().treeNonce).toBe(before + 1))
  })

  it("docks the console when it is on and detached but placed nowhere", async () => {
    const { usePreview } = await import("@/lib/preview")
    usePreview.setState({ inspector: true, inspectorDetached: true })
    render(<ProjectView root={ROOT} />)
    await waitFor(() =>
      expect(
        useLayout.getState().layout.areas.bottom.groups.some((g) => g.tabs.includes("inspector")),
      ).toBe(true),
    )
  })

  it("keeps the resolve loop ticking while the project is open", async () => {
    vi.useFakeTimers()
    const { useResolveLoop } = await import("@/lib/resolveLoop")
    const tick = vi.fn()
    useResolveLoop.setState({ tick })
    render(<ProjectView root={ROOT} />)
    await vi.advanceTimersByTimeAsync(16_000)
    expect(tick).toHaveBeenCalledWith(ROOT)
    vi.useRealTimers()
  })
})
