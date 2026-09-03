// UI test: the browser preview pane. The page itself is a native child window,
// so everything it does is a `preview_*` command — all mocked here. What's
// asserted is the chrome (URL bar, devices, zoom, inspector) and the poll loop
// that drains the page bridge and runs the agent's commands.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = {
  previewOpen: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  previewClose: vi.fn(async () => {}),
  previewNavigate: vi.fn<(u: string) => Promise<void>>(async () => {}),
  previewBack: vi.fn(async () => {}),
  previewForward: vi.fn(async () => {}),
  previewReload: vi.fn(async () => {}),
  previewDetach: vi.fn<(u: string) => Promise<void>>(async () => {}),
  previewSetBounds: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  previewSetVisible: vi.fn<(v: boolean) => Promise<void>>(async () => {}),
  previewSetZoom: vi.fn<(z: number) => Promise<void>>(async () => {}),
  previewCaptureFrame: vi.fn<(...a: unknown[]) => Promise<string>>(async () => "frame.png"),
  previewPersistState: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  previewClearState: vi.fn<(r: string) => Promise<void>>(async () => {}),
  previewPutResult: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  previewTakeCmd: vi.fn<(r: string) => Promise<string | null>>(async () => null),
  previewDetectUrls: vi.fn<(...a: unknown[]) => Promise<string[]>>(async () => []),
  previewEval: vi.fn<(script: string) => Promise<string>>(async () => ""),
}
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  previewOpen: (...a: unknown[]) => api.previewOpen(...a),
  previewClose: () => api.previewClose(),
  previewNavigate: (u: string) => api.previewNavigate(u),
  previewBack: () => api.previewBack(),
  previewForward: () => api.previewForward(),
  previewReload: () => api.previewReload(),
  previewDetach: (u: string) => api.previewDetach(u),
  previewSetBounds: (...a: unknown[]) => api.previewSetBounds(...a),
  previewSetVisible: (v: boolean) => api.previewSetVisible(v),
  previewSetZoom: (z: number) => api.previewSetZoom(z),
  previewCaptureFrame: (...a: unknown[]) => api.previewCaptureFrame(...a),
  previewPersistState: (...a: unknown[]) => api.previewPersistState(...a),
  previewClearState: (r: string) => api.previewClearState(r),
  previewPutResult: (...a: unknown[]) => api.previewPutResult(...a),
  previewTakeCmd: (r: string) => api.previewTakeCmd(r),
  previewDetectUrls: (...a: unknown[]) => api.previewDetectUrls(...a),
  previewEval: (s: string) => api.previewEval(s),
}))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onMoved: vi.fn(async () => () => {}),
    onResized: vi.fn(async () => () => {}),
  }),
}))
vi.mock("../BrowserInspector", () => ({ BrowserInspector: () => <div>inspector-body</div> }))

import { BrowserPanel } from "@/components/organisms/BrowserPanel"
import { useComments } from "@/lib/comments"
import { useLayout } from "@/lib/layout"
import { usePreview } from "@/lib/preview"
import { usePalette, useProject, useSettings, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

/** What the page bridge hands back on the next drain. */
function bridgeReturns(payload: unknown) {
  api.previewEval.mockImplementation(async (script: string) =>
    script.includes("drain()") ? JSON.stringify(payload) : "",
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.previewEval.mockResolvedValue("")
  api.previewTakeCmd.mockResolvedValue(null)
  api.previewDetectUrls.mockResolvedValue([])
  // happy-dom measures every box as 0×0, and the pane's whole job is parking a
  // native window over its placeholder — give it a real rect.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    width: 800,
    height: 600,
    right: 900,
    bottom: 650,
    toJSON: () => ({}),
  } as DOMRect)
  useProject.setState({ root: ROOT })
  usePreview.setState({
    open: true,
    url: "http://localhost:5173",
    inspector: false,
    inspectorPos: "bottom",
    inspectorSize: 240,
    inspectorDetached: false,
    agentAccess: false,
    allowlist: [],
    device: null,
    paneWidth: 480,
    browserZoom: 1,
    logs: [],
    net: [],
    pinRequest: null,
    inspectRequest: null,
  })
  useComments.setState({ comments: [] })
  usePalette.setState({
    mode: null,
    settingsOpen: false,
    shortcutsOpen: false,
    anywhereOpen: false,
  })
  useWorkspace.setState({ graphOpen: false, docsOpen: false })
  useLayout.setState({ dragging: null, menuOpen: false })
})
afterEach(() => vi.restoreAllMocks())

describe("parking the native webview", () => {
  it("opens it over the placeholder, at the placeholder's rect", async () => {
    render(<BrowserPanel />)
    await waitFor(() =>
      expect(api.previewOpen).toHaveBeenCalledWith("http://localhost:5173", 100, 50, 800, 600),
    )
  })

  it("closes it — and drops the agent's mirror — when the pane unmounts", async () => {
    const { unmount } = render(<BrowserPanel />)
    await waitFor(() => expect(api.previewOpen).toHaveBeenCalled())
    unmount()
    expect(api.previewClose).toHaveBeenCalled()
    expect(api.previewClearState).toHaveBeenCalledWith(ROOT)
  })

  it("centres a device-sized viewport inside the pane", async () => {
    usePreview.setState({ device: { w: 390, h: 844, label: "Mobile" } })
    render(<BrowserPanel />)
    await waitFor(() => expect(api.previewOpen).toHaveBeenCalled())
    const [, x, , w] = vi.mocked(api.previewOpen).mock.calls[0] as unknown as number[]
    expect(w).toBe(390)
    expect(x).toBe(100 + (800 - 390) / 2)
  })

  it("hides while a Reado overlay is open — a DOM overlay can't sit over it", async () => {
    const { rerender } = render(<BrowserPanel />)
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenCalledWith(true))
    usePalette.setState({ settingsOpen: true })
    rerender(<BrowserPanel />)
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenLastCalledWith(false))
  })

  it("hides while a dock drag or dock menu is up, so the drop targets show", async () => {
    render(<BrowserPanel />)
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenCalled())
    useLayout.setState({ dragging: "browser" })
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenLastCalledWith(false))
    useLayout.setState({ dragging: null })
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenLastCalledWith(true))
    // The dock's own menu is DOM too, and would be covered by the child window.
    useLayout.setState({ menuOpen: true })
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenLastCalledWith(false))
  })
})

describe("the toolbar", () => {
  it("drives history and reload through the webview", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByLabelText("preview.back"))
    await userEvent.click(screen.getByLabelText("preview.forward"))
    await userEvent.click(screen.getByLabelText("preview.reload"))
    expect(api.previewBack).toHaveBeenCalled()
    expect(api.previewForward).toHaveBeenCalled()
    expect(api.previewReload).toHaveBeenCalled()
  })

  it("navigates to a typed URL, adding the scheme for a bare host", async () => {
    render(<BrowserPanel />)
    const bar = screen.getByLabelText("preview.url")
    await userEvent.clear(bar)
    await userEvent.type(bar, "localhost:3000{Enter}")
    expect(usePreview.getState().url).toBe("http://localhost:3000")
    await waitFor(() =>
      expect(api.previewOpen).toHaveBeenCalledWith("http://localhost:3000", 100, 50, 800, 600),
    )
  })

  it("keeps a URL that already has a scheme", async () => {
    render(<BrowserPanel />)
    const bar = screen.getByLabelText("preview.url")
    await userEvent.clear(bar)
    await userEvent.type(bar, "https://example.com{Enter}")
    expect(usePreview.getState().url).toBe("https://example.com")
  })

  it("toggles agent access, the inspector and the comment marks", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByLabelText("preview.agentAccess"))
    expect(usePreview.getState().agentAccess).toBe(true)
    await userEvent.click(screen.getByLabelText("inspector.toggle"))
    expect(usePreview.getState().inspector).toBe(true)
    await userEvent.click(screen.getByLabelText("browserComment.hideMarks"))
    expect(await screen.findByLabelText("browserComment.showMarks")).toBeInTheDocument()
  })

  it("detaching hands the page to a real window and closes the pane", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByLabelText("preview.detach"))
    expect(api.previewDetach).toHaveBeenCalledWith("http://localhost:5173")
    expect(usePreview.getState().open).toBe(false)
  })

  it("closes the pane", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByLabelText("preview.close"))
    expect(usePreview.getState().open).toBe(false)
  })
})

describe("the device bar", () => {
  it("emulates a viewport, and goes back to filling the pane", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByText("preview.device.mobile"))
    expect(usePreview.getState().device).toMatchObject({ w: 390, h: 844 })
    await userEvent.click(screen.getByText("preview.device.responsive"))
    expect(usePreview.getState().device).toBeNull()
  })

  it("takes a custom size from the W/H fields", async () => {
    render(<BrowserPanel />)
    fireEvent.change(screen.getByPlaceholderText("W"), { target: { value: "1024" } })
    expect(usePreview.getState().device).toMatchObject({ w: 1024, h: 844 })
    fireEvent.change(screen.getByPlaceholderText("H"), { target: { value: "768" } })
    expect(usePreview.getState().device).toMatchObject({ w: 1024, h: 768 })
  })

  it("zooms the page in and out, and takes a typed percentage", async () => {
    render(<BrowserPanel />)
    await userEvent.click(screen.getByLabelText("preview.zoomIn"))
    expect(usePreview.getState().browserZoom).toBeCloseTo(1.1)
    await userEvent.click(screen.getByLabelText("preview.zoomOut"))
    expect(usePreview.getState().browserZoom).toBeCloseTo(1)
    fireEvent.change(screen.getByLabelText("Zoom %"), { target: { value: "50" } })
    expect(usePreview.getState().browserZoom).toBeCloseTo(0.5)
  })

  it("offers 'fit' only for an emulated device, and fits it to the pane", async () => {
    render(<BrowserPanel />)
    expect(screen.queryByText("preview.fit")).not.toBeInTheDocument()
    await userEvent.click(screen.getByText("preview.device.laptop"))
    await userEvent.click(screen.getByText("preview.fit"))
    // 800/1280 vs 600/800 → the width is the binding constraint.
    expect(usePreview.getState().browserZoom).toBeCloseTo(800 / 1280)
  })
})

describe("the inspector", () => {
  it("docks inside the pane when it isn't detached", () => {
    usePreview.setState({ inspector: true })
    render(<BrowserPanel />)
    expect(screen.getByText("inspector-body")).toBeInTheDocument()
  })

  it("stays out when it is detached — the dock renders it instead", () => {
    usePreview.setState({ inspector: true, inspectorDetached: true })
    render(<BrowserPanel />)
    expect(screen.queryByText("inspector-body")).not.toBeInTheDocument()
  })

  it("resizes by dragging its edge", () => {
    usePreview.setState({ inspector: true })
    const { container } = render(<BrowserPanel />)
    const handle = container.querySelector(".cursor-row-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientY: 400 })
    fireEvent.pointerMove(window, { clientY: 300 }) // dragged up → taller
    expect(usePreview.getState().inspectorSize).toBe(340)
    fireEvent.pointerUp(window)
  })
})

describe("draining the page bridge", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Let the 700ms poll fire once. */
  const tick = () => vi.advanceTimersByTimeAsync(750)

  it("feeds console output into the shared capture store", async () => {
    bridgeReturns({ logs: [{ level: "error", text: "boom", ts: 1 }], net: [] })
    render(<BrowserPanel />)
    await tick()
    expect(usePreview.getState().logs).toHaveLength(1)
  })

  it("only re-publishes network when it actually changed", async () => {
    bridgeReturns({ logs: [], net: [{ id: "1", url: "/api", status: 200 }] })
    render(<BrowserPanel />)
    await tick()
    expect(usePreview.getState().net).toHaveLength(1)
    usePreview.setState({ net: [] }) // if it republished, this would come back
    await tick()
    expect(usePreview.getState().net).toEqual([])
  })

  it("opens the inspector when the page asks to inspect a node", async () => {
    bridgeReturns({ inspect: [0, 2, 1] })
    render(<BrowserPanel />)
    await tick()
    expect(usePreview.getState().inspector).toBe(true)
    expect(usePreview.getState().inspectRequest).toEqual([0, 2, 1])
  })

  it("creates a design comment from the in-page composer", async () => {
    const create = vi.fn(async () => ({ firstComment: false }))
    useComments.setState({ create } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({
      commentAt: { x: 10, y: 20, url: "http://localhost:5173/", text: "this is off" },
    })
    render(<BrowserPanel />)
    await tick()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "web", body: "this is off", x: 10, y: 20 }),
    )
  })

  it("posts a reply typed into the in-page card", async () => {
    const reply = vi.fn(async () => {})
    useComments.setState({ reply } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({ commentReply: { id: "c1", text: "agreed" } })
    render(<BrowserPanel />)
    await tick()
    expect(reply).toHaveBeenCalledWith("c1", "agreed")
  })

  it("resolves a comment from the card and dismisses it", async () => {
    const setState = vi.fn(async () => {})
    useComments.setState({ setState } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({ commentResolve: "c1" })
    render(<BrowserPanel />)
    await tick()
    expect(setState).toHaveBeenCalledWith("c1", "done")
  })

  it("coalesces type/kind/body edits for one comment into a single patch", async () => {
    const patch = vi.fn(async () => {})
    useComments.setState({ patch } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({
      commentType: { id: "c1", type: "bug" },
      commentKind: { id: "c1", kind: "task" },
      commentEdit: { id: "c1", text: "sharper" },
    })
    render(<BrowserPanel />)
    await tick()
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith("c1", { type: "bug", kind: "task", body: "sharper" })
  })

  it("mirrors the capture to .reado/ only while agent access is on", async () => {
    bridgeReturns({ logs: [{ level: "log", text: "x", ts: 1 }], net: [] })
    render(<BrowserPanel />)
    await tick()
    expect(api.previewPersistState).not.toHaveBeenCalled()
    usePreview.setState({ agentAccess: true })
    await tick()
    expect(api.previewPersistState).toHaveBeenCalled()
  })
})

describe("running the agent's commands", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const tick = () => vi.advanceTimersByTimeAsync(750)

  it("evaluates its script in the page and reports the result", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(
      JSON.stringify({ id: "1", op: "eval", arg: "document.title" }),
    )
    api.previewEval.mockImplementation(async (s: string) =>
      s.includes("drain()") ? "null" : "My page",
    )
    render(<BrowserPanel />)
    await tick()
    expect(api.previewPutResult).toHaveBeenCalledWith(
      ROOT,
      JSON.stringify({ id: "1", ok: true, result: "My page" }),
    )
  })

  it("resolves a relative navigation against the current URL", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(
      JSON.stringify({ id: "2", op: "navigate", arg: "/roadmap" }),
    )
    render(<BrowserPanel />)
    await tick()
    expect(api.previewNavigate).toHaveBeenCalledWith("http://localhost:5173/roadmap")
    expect(usePreview.getState().url).toBe("http://localhost:5173/roadmap")
  })

  it("refuses to navigate off the allowlist", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(
      JSON.stringify({ id: "3", op: "navigate", arg: "https://evil.example" }),
    )
    render(<BrowserPanel />)
    await tick()
    expect(api.previewNavigate).not.toHaveBeenCalled()
    expect(api.previewPutResult).toHaveBeenCalledWith(
      ROOT,
      JSON.stringify({ id: "3", ok: false, result: "origin not allowed" }),
    )
  })

  it("reports an unknown op rather than guessing", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "4", op: "teleport" }))
    render(<BrowserPanel />)
    await tick()
    expect(api.previewPutResult).toHaveBeenCalledWith(
      ROOT,
      JSON.stringify({ id: "4", ok: false, result: "unknown op: teleport" }),
    )
  })

  it("captures a frame of the pane", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "5", op: "frame" }))
    render(<BrowserPanel />)
    await tick()
    expect(api.previewCaptureFrame).toHaveBeenCalledWith(100, 50, 800, 600)
  })

  it("runs nothing while agent access is off", async () => {
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "6", op: "eval", arg: "1" }))
    render(<BrowserPanel />)
    await tick()
    // The poll itself must be alive — it is only the agent queue that is gated.
    expect(api.previewEval).toHaveBeenCalled()
    expect(api.previewTakeCmd).not.toHaveBeenCalled()
  })
})

describe("finding the dev server", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("switches to a detected server while the current URL is dead", async () => {
    api.previewDetectUrls.mockResolvedValue(["http://localhost:3000"])
    render(<BrowserPanel />)
    await vi.advanceTimersByTimeAsync(50)
    expect(usePreview.getState().url).toBe("http://localhost:3000")
  })

  it("reloads once the current URL comes alive", async () => {
    api.previewDetectUrls.mockResolvedValue([])
    render(<BrowserPanel />)
    await vi.advanceTimersByTimeAsync(50)
    api.previewOpen.mockClear()
    api.previewDetectUrls.mockResolvedValue(["http://localhost:5173"])
    await vi.advanceTimersByTimeAsync(2100)
    expect(api.previewOpen).toHaveBeenCalledWith("http://localhost:5173", 100, 50, 800, 600)
  })

  it("never overrides a URL the user typed", async () => {
    render(<BrowserPanel />)
    await vi.advanceTimersByTimeAsync(50)
    fireEvent.keyDown(screen.getByLabelText("preview.url"), {
      key: "Enter",
      target: { value: "http://localhost:4000" },
    })
    api.previewDetectUrls.mockResolvedValue(["http://localhost:3000"])
    await vi.advanceTimersByTimeAsync(2100)
    expect(usePreview.getState().url).toBe("http://localhost:4000")
  })
})

describe("more of the page bridge", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const tick = () => vi.advanceTimersByTimeAsync(750)

  it("recreates the webview when it vanished under an open pane", async () => {
    api.previewEval.mockRejectedValue(new Error("no preview for this window"))
    render(<BrowserPanel />)
    api.previewOpen.mockClear()
    await tick()
    expect(api.previewOpen).toHaveBeenCalled()
  })

  it("shrugs off any other eval failure", async () => {
    api.previewEval.mockRejectedValue(new Error("page still loading"))
    render(<BrowserPanel />)
    api.previewOpen.mockClear()
    await tick()
    expect(api.previewEval).toHaveBeenCalled()
    expect(api.previewOpen).not.toHaveBeenCalled()
  })

  it("ignores a drain that isn't JSON", async () => {
    api.previewEval.mockResolvedValue("not json")
    render(<BrowserPanel />)
    await tick()
    expect(api.previewEval).toHaveBeenCalled()
    expect(usePreview.getState().logs).toEqual([])
  })

  it("leaves the inspector alone when it is already open", async () => {
    usePreview.setState({ inspector: true, inspectRequest: null })
    bridgeReturns({ inspect: [1] })
    render(<BrowserPanel />)
    await tick()
    // The drain must still have run — only the open-toggle is skipped.
    expect(usePreview.getState().inspectRequest).toEqual([1])
    expect(usePreview.getState().inspector).toBe(true)
  })

  it("ignores an in-page composer that was submitted empty", async () => {
    const create = vi.fn(async () => ({ firstComment: false }))
    useComments.setState({ create } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({ commentAt: { x: 1, y: 2, url: "http://localhost:5173/", text: "" } })
    render(<BrowserPanel />)
    await tick()
    expect(create).not.toHaveBeenCalled()
  })

  it("prompts for the gitignore after the project's very first comment", async () => {
    const create = vi.fn(async () => ({ firstComment: true }))
    const setGitignorePrompt = vi.fn()
    useComments.setState({ create, setGitignorePrompt } as unknown as Parameters<
      typeof useComments.setState
    >[0])
    useSettings.setState({ gitignoreDontAsk: false })
    bridgeReturns({ commentAt: { x: 1, y: 2, url: "http://localhost:5173/", text: "look" } })
    render(<BrowserPanel />)
    await tick()
    await vi.advanceTimersByTimeAsync(10)
    expect(setGitignorePrompt).toHaveBeenCalledWith(true)
  })

  it("won't prompt again once the user said not to ask", async () => {
    const create = vi.fn(async () => ({ firstComment: true }))
    const setGitignorePrompt = vi.fn()
    useComments.setState({ create, setGitignorePrompt } as unknown as Parameters<
      typeof useComments.setState
    >[0])
    useSettings.setState({ gitignoreDontAsk: true })
    bridgeReturns({ commentAt: { x: 1, y: 2, url: "http://localhost:5173/", text: "look" } })
    render(<BrowserPanel />)
    await tick()
    await vi.advanceTimersByTimeAsync(10)
    expect(setGitignorePrompt).not.toHaveBeenCalled()
  })

  it("opens the card for a dot the page reports", async () => {
    useComments.setState({
      comments: [
        {
          id: "c1",
          state: "open",
          type: "note",
          kind: "note",
          messages: [{ author: "me", body: "here", createdAt: 0 }],
          anchor: {
            scope: "web",
            file: "",
            url: "http://localhost:5173/",
            x: 1,
            y: 2,
            startLine: 0,
            endLine: 0,
          },
        },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({ openComment: "c1" })
    render(<BrowserPanel />)
    await tick()
    expect(vi.mocked(api.previewEval).mock.calls.some(([s]) => s.includes("showComment"))).toBe(
      true,
    )
  })

  it("re-draws the page's comment dots when the set changes", async () => {
    useComments.setState({
      comments: [
        {
          id: "c1",
          state: "open",
          type: "note",
          kind: "note",
          messages: [{ author: "me", body: "here", createdAt: 0 }],
          anchor: {
            scope: "web",
            file: "",
            url: "http://localhost:5173/x",
            x: 1,
            y: 2,
            startLine: 0,
            endLine: 0,
          },
        },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    bridgeReturns({ hasMarks: false })
    render(<BrowserPanel />)
    await tick()
    expect(vi.mocked(api.previewEval).mock.calls.some(([s]) => s.includes(".marks("))).toBe(true)
  })

  it("captures the pane's own rect, whatever it currently measures", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "9", op: "frame" }))
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 200,
      top: 5,
      left: 7,
      right: 307,
      bottom: 205,
      x: 7,
      y: 5,
      toJSON: () => ({}),
    } as DOMRect)
    render(<BrowserPanel />)
    await tick()
    expect(api.previewCaptureFrame).toHaveBeenCalledWith(7, 5, 300, 200)
  })

  it("reports an eval that threw inside the page", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "10", op: "eval", arg: "boom" }))
    api.previewEval.mockImplementation(async (s: string) => {
      if (s.includes("drain()")) return "null"
      throw new Error("ReferenceError: boom")
    })
    render(<BrowserPanel />)
    await tick()
    expect(
      vi
        .mocked(api.previewPutResult)
        .mock.calls.some(([, json]) => String(json).includes("ReferenceError")),
    ).toBe(true)
  })

  it("runs a command only once, however often it is polled", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "11", op: "eval", arg: "1" }))
    render(<BrowserPanel />)
    await tick()
    await tick()
    expect(api.previewPutResult).toHaveBeenCalledTimes(1)
  })

  it("ignores an empty command queue", async () => {
    usePreview.setState({ agentAccess: true })
    api.previewTakeCmd.mockResolvedValue(null)
    render(<BrowserPanel />)
    await tick()
    expect(api.previewTakeCmd).toHaveBeenCalled()
    expect(api.previewPutResult).not.toHaveBeenCalled()
  })
})

describe("resizing the pane", () => {
  it("drags its own width when it isn't docked", () => {
    const { container } = render(<BrowserPanel />)
    const handle = container.querySelector(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 900 })
    fireEvent.pointerMove(window, { clientX: 700 })
    expect(usePreview.getState().paneWidth).toBeGreaterThan(480)
    fireEvent.pointerUp(window)
  })

  it("stops growing before it pushes the editor off-screen", () => {
    const { container } = render(<BrowserPanel />)
    const handle = container.querySelector(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 900 })
    // Drag far past the left edge: the pane can only grow so far, or the
    // editor is gone and the handle that would bring it back is off-screen too.
    fireEvent.pointerMove(window, { clientX: -5000 })
    expect(usePreview.getState().paneWidth).toBeLessThanOrEqual(window.innerWidth - 200)
    fireEvent.pointerUp(window)
  })

  it("leaves its size to the dock when docked", () => {
    const { container } = render(<BrowserPanel docked />)
    expect(container.querySelector(".cursor-col-resize")).toBeNull()
  })

  it("resizes the inspector along its docked edge", () => {
    usePreview.setState({ inspector: true, inspectorPos: "right", inspectorSize: 240 })
    const { container } = render(<BrowserPanel />)
    const handle = container.querySelector(".cursor-col-resize:not(.-left-1)") as HTMLElement
    const handles = container.querySelectorAll(".cursor-col-resize")
    fireEvent.pointerDown(handles[handles.length - 1] as HTMLElement, { clientX: 800 })
    fireEvent.pointerMove(window, { clientX: 700 })
    expect(usePreview.getState().inspectorSize).toBe(340)
    fireEvent.pointerUp(window)
    void handle
  })
})

describe("a comment clicked in the list", () => {
  it("navigates the preview there and opens its card", async () => {
    vi.useFakeTimers()
    useComments.setState({
      comments: [
        {
          id: "c1",
          state: "open",
          type: "note",
          kind: "note",
          messages: [{ author: "me", body: "here", createdAt: 0 }],
          anchor: {
            scope: "web",
            file: "",
            url: "http://localhost:5173/x",
            x: 1,
            y: 2,
            startLine: 0,
            endLine: 0,
          },
        },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    usePreview.setState({ pinRequest: { url: "http://localhost:5173/x", x: 1, y: 2, id: "c1" } })
    render(<BrowserPanel />)
    await vi.advanceTimersByTimeAsync(1200)
    expect(api.previewNavigate).toHaveBeenCalledWith("http://localhost:5173/x")
    expect(usePreview.getState().pinRequest).toBeNull()
    vi.useRealTimers()
  })

  it("still opens the card when the navigation is refused", async () => {
    vi.useFakeTimers()
    api.previewNavigate.mockRejectedValue(new Error("blocked"))
    useComments.setState({
      comments: [
        {
          id: "c1",
          state: "open",
          type: "note",
          kind: "note",
          messages: [{ author: "me", body: "still here", createdAt: 0 }],
          anchor: {
            scope: "web",
            file: "",
            url: "http://x/",
            x: 1,
            y: 2,
            startLine: 0,
            endLine: 0,
          },
        },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    usePreview.setState({ pinRequest: { url: "http://x/", x: 1, y: 2, id: "c1" } })
    render(<BrowserPanel />)
    await vi.advanceTimersByTimeAsync(1200)
    // The page it wanted didn't load, but the comment still opens on whatever
    // is showing — better than swallowing the click.
    expect(vi.mocked(api.previewEval).mock.calls.some(([s]) => s.includes("still here"))).toBe(true)
    expect(usePreview.getState().pinRequest).toBeNull()
    vi.useRealTimers()
  })
})
