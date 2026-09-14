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
  hostResolves: vi.fn<(name: string) => Promise<boolean>>(async () => false),
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
  hostResolves: (n: string) => api.hostResolves(n),
}))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onMoved: vi.fn(async () => () => {}),
    onResized: vi.fn(async () => () => {}),
  }),
}))
vi.mock("../BrowserInspector", () => ({ BrowserInspector: () => <div>inspector-body</div> }))

import { useState } from "react"
import { Modal } from "@/components/atoms/Modal"
import { BrowserPanel, normalizeUrl, singleLabelHost } from "@/components/organisms/BrowserPanel"
import { useComments } from "@/lib/comments"
import { useLayout } from "@/lib/layout"
import { useDialogs, usePreview } from "@/lib/preview"
import { usePalette, useProject, useSettings, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

/** Any shared `Modal` — stands in for the updater's, settings', anyone's. */
function ModalProbe() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal open={open} onOpenChange={setOpen} ariaLabel="probe">
        body
      </Modal>
    </>
  )
}

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
  api.hostResolves.mockResolvedValue(false)
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
    secrets: [],
    grantedUrl: null,
    accessRequest: null,
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
  useDialogs.setState({ count: 0 })
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

  it("hides while any Modal is open — the updater's included", async () => {
    render(
      <>
        <BrowserPanel />
        <ModalProbe />
      </>,
    )
    await waitFor(() => expect(api.previewSetVisible).toHaveBeenLastCalledWith(true))
    await userEvent.click(screen.getByText("open"))
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

  it("uses https for a bare public host, http when it looks local", async () => {
    render(<BrowserPanel />)
    // The input is keyed on the URL, so it remounts after each go — re-query it.
    const type = async (v: string) => {
      fireEvent.keyDown(screen.getByLabelText("preview.url"), {
        key: "Enter",
        target: { value: v },
      })
      return usePreview.getState().url
    }
    expect(await type("example.com")).toBe("https://example.com")
    // An explicit port, a dev TLD or loopback → a dev server, which speaks http.
    expect(await type("local.aws.pippo.com:3000")).toBe("http://local.aws.pippo.com:3000")
    expect(await type("myapp.local/dash")).toBe("http://myapp.local/dash")
  })

  it("searches the web when what was typed isn't an address", async () => {
    render(<BrowserPanel />)
    fireEvent.keyDown(screen.getByLabelText("preview.url"), {
      key: "Enter",
      target: { value: "how do i center a div" },
    })
    expect(usePreview.getState().url).toBe(
      "https://duckduckgo.com/?q=how%20do%20i%20center%20a%20div",
    )
  })

  it("allowlists the origin the user navigated to, so the agent can follow", async () => {
    render(<BrowserPanel />)
    fireEvent.keyDown(screen.getByLabelText("preview.url"), {
      key: "Enter",
      target: { value: "http://local.aws.pippo.com:3000/app" },
    })
    expect(usePreview.getState().allowlist).toEqual(["http://local.aws.pippo.com:3000"])
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

describe("following the page", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("puts the page's own URL in the address bar", async () => {
    // A link, a redirect, or a router pushing a route moves the page without
    // telling Reado. The bar showed whatever was last typed, so it lied about
    // where you were — and Back, Reload and "open externally" all lied with it.
    render(<BrowserPanel />)
    bridgeReturns({ href: "http://localhost:5173/roadmap" })
    await vi.advanceTimersByTimeAsync(1200)
    expect(usePreview.getState().url).toBe("http://localhost:5173/roadmap")
  })

  it("does not retype the address while the user is editing it", async () => {
    render(<BrowserPanel />)
    const bar = screen.getByLabelText("preview.url")
    fireEvent.focus(bar)
    bridgeReturns({ href: "http://localhost:5173/elsewhere" })
    await vi.advanceTimersByTimeAsync(1200)
    expect(usePreview.getState().url).toBe("http://localhost:5173")
  })

  it("leaves a loaded page where it is, whatever the dev-server scan says", async () => {
    // The bug behind "the URL never changes and Back does nothing": every two
    // seconds this scan re-navigated the webview to the address Reado had
    // written down — so a page you had navigated to snapped back, and the
    // history it would have gone back through was thrown away with it.
    render(<BrowserPanel />)
    bridgeReturns({ href: "http://localhost:5173/roadmap" })
    await vi.advanceTimersByTimeAsync(1200)
    api.previewOpen.mockClear()
    api.previewDetectUrls.mockResolvedValue(["http://localhost:3000"])
    await vi.advanceTimersByTimeAsync(4200)
    expect(api.previewOpen).not.toHaveBeenCalled()
    expect(usePreview.getState().url).toBe("http://localhost:5173/roadmap")
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

  it("stops polling when the pane has no window to poll", async () => {
    // Zero-sized placeholder: the pane is behind another dock tab or its area is
    // collapsed, so no child window was ever opened. Polling it anyway failed
    // with "no preview pane running" every 700ms, forever, filling the log.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    } as DOMRect)
    render(<BrowserPanel />)
    await tick()
    await tick()
    expect(api.previewOpen).not.toHaveBeenCalled()
    expect(api.previewEval).not.toHaveBeenCalled()
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

describe("a page holding a credential", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const tick = () => vi.advanceTimersByTimeAsync(750)

  /** The page answers the gate probe; anything else is the command's own script. */
  const pageHolds = (hasSecret: boolean, href = "http://localhost:5173/login") =>
    api.previewEval.mockImplementation(async (s: string) => {
      if (s.includes("hasSecret")) return JSON.stringify({ href, hasSecret })
      if (s.includes("drain()")) return "null"
      return '"the password is s3cr3t!"'
    })

  const command = () =>
    api.previewTakeCmd.mockResolvedValue(
      JSON.stringify({ id: "9", op: "eval", arg: "document.querySelector('input').value" }),
    )

  it("refuses the agent's command and asks the user instead", async () => {
    usePreview.setState({ agentAccess: true })
    pageHolds(true)
    command()
    render(<BrowserPanel />)
    await tick()
    expect(api.previewPutResult).toHaveBeenCalledWith(
      ROOT,
      expect.stringContaining("has not granted access"),
    )
    // Refused, not filtered: the command's own script never ran.
    expect(api.previewEval).not.toHaveBeenCalledWith("document.querySelector('input').value")
    expect(usePreview.getState().accessRequest).toBe("http://localhost:5173/login")
  })

  it("runs the command once the user grants that page", async () => {
    usePreview.setState({ agentAccess: true, grantedUrl: "http://localhost:5173/login" })
    pageHolds(true)
    command()
    render(<BrowserPanel />)
    await tick()
    expect(api.previewEval).toHaveBeenCalledWith("document.querySelector('input').value")
  })

  it("does not honour a grant given for another page", async () => {
    usePreview.setState({ agentAccess: true, grantedUrl: "http://localhost:5173/other" })
    pageHolds(true)
    command()
    render(<BrowserPanel />)
    await tick()
    expect(api.previewEval).not.toHaveBeenCalledWith("document.querySelector('input').value")
  })

  it("lets commands through when no password field holds anything", async () => {
    usePreview.setState({ agentAccess: true })
    pageHolds(false)
    command()
    render(<BrowserPanel />)
    await tick()
    expect(api.previewEval).toHaveBeenCalledWith("document.querySelector('input').value")
  })

  it("asks the user once per page, not on every refused command", async () => {
    usePreview.setState({ agentAccess: true })
    pageHolds(true)
    command()
    render(<BrowserPanel />)
    await tick()
    usePreview.getState().setAccessRequest(null) // the user said "not now"
    api.previewTakeCmd.mockResolvedValue(JSON.stringify({ id: "10", op: "eval", arg: "x" }))
    await tick()
    expect(usePreview.getState().accessRequest).toBeNull()
  })

  it("offers the agent no way to reach the vault", async () => {
    usePreview.setState({ agentAccess: true })
    pageHolds(false)
    api.previewTakeCmd.mockResolvedValue(
      JSON.stringify({ id: "11", op: "vault_lookup", arg: "https://example.com" }),
    )
    render(<BrowserPanel />)
    await tick()
    expect(api.previewPutResult).toHaveBeenCalledWith(ROOT, expect.stringContaining("unknown op"))
  })

  it("drops the grant when the pane navigates", async () => {
    usePreview.setState({ grantedUrl: "http://localhost:5173/login", secrets: ["s3cr3t!"] })
    usePreview.getState().setUrl("http://localhost:5173/app")
    expect(usePreview.getState().grantedUrl).toBeNull()
    expect(usePreview.getState().secrets).toEqual([])
  })

  it("redacts a filled secret from what reaches the agent", async () => {
    usePreview.setState({ agentAccess: true, secrets: ["s3cr3t!"] })
    pageHolds(false)
    command()
    render(<BrowserPanel />)
    await tick()
    const calls = api.previewPutResult.mock.calls
    const sent = calls[calls.length - 1]?.[1] as string
    expect(sent).not.toContain("s3cr3t!")
    expect(sent).toContain("«redacted»")
  })

  it("redacts the mirrored capture but leaves the inspector's copy intact", async () => {
    usePreview.setState({ agentAccess: true, secrets: ["s3cr3t!"] })
    bridgeReturns({ logs: [{ level: "log", args: ["sending s3cr3t! now"], t: 1 }], net: [] })
    render(<BrowserPanel />)
    await tick()
    const mirrored = api.previewPersistState.mock.calls
    const [, consoleJson] = mirrored[mirrored.length - 1] as string[]
    expect(consoleJson).not.toContain("s3cr3t!")
    // The store the inspector renders keeps the real page, as DevTools would.
    expect(JSON.stringify(usePreview.getState().logs)).toContain("s3cr3t!")
  })
})

describe("typing an address and pressing Enter", () => {
  it("navigates the pane to what was typed", async () => {
    render(<BrowserPanel />)
    await waitFor(() => expect(api.previewOpen).toHaveBeenCalled())
    vi.mocked(api.previewOpen).mockClear()
    const bar = screen.getByLabelText("preview.url")
    fireEvent.change(bar, { target: { value: "127.0.0.1:9000/app" } })
    fireEvent.keyDown(bar, { key: "Enter" })
    await waitFor(() =>
      expect(api.previewOpen).toHaveBeenCalledWith("http://127.0.0.1:9000/app", 100, 50, 800, 600),
    )
    expect(usePreview.getState().url).toBe("http://127.0.0.1:9000/app")
  })

  it("asks the machine about a bare name, and goes there when it resolves", async () => {
    // The /etc/hosts case: nothing in the webview can see the file, so the bar
    // asks the backend before deciding between a host and a search.
    api.hostResolves.mockResolvedValue(true)
    render(<BrowserPanel />)
    await waitFor(() => expect(api.previewOpen).toHaveBeenCalled())
    vi.mocked(api.previewOpen).mockClear()
    const bar = screen.getByLabelText("preview.url")
    fireEvent.change(bar, { target: { value: "readodev" } })
    fireEvent.keyDown(bar, { key: "Enter" })
    await waitFor(() => expect(api.hostResolves).toHaveBeenCalledWith("readodev"))
    await waitFor(() =>
      expect(api.previewOpen).toHaveBeenCalledWith("http://readodev", 100, 50, 800, 600),
    )
  })

  it("searches for a bare word that resolves to nothing", async () => {
    api.hostResolves.mockResolvedValue(false)
    render(<BrowserPanel />)
    await waitFor(() => expect(api.previewOpen).toHaveBeenCalled())
    vi.mocked(api.previewOpen).mockClear()
    const bar = screen.getByLabelText("preview.url")
    fireEvent.change(bar, { target: { value: "nonesuch" } })
    fireEvent.keyDown(bar, { key: "Enter" })
    await waitFor(() =>
      expect(api.previewOpen).toHaveBeenCalledWith(
        expect.stringContaining("duckduckgo.com"),
        100,
        50,
        800,
        600,
      ),
    )
  })
})

describe("what the address bar makes of what you type", () => {
  it("keeps a scheme, and picks one for a bare host", () => {
    expect(normalizeUrl("http://localhost:5173/x")).toBe("http://localhost:5173/x")
    // Local names get http: plain http to a public host is refused by the
    // platform, and a dev server rarely has a certificate.
    expect(normalizeUrl("localhost:5173")).toBe("http://localhost:5173")
    expect(normalizeUrl("127.0.0.1:8080/a")).toBe("http://127.0.0.1:8080/a")
    expect(normalizeUrl("app.test")).toBe("http://app.test")
    expect(normalizeUrl("myapp.local")).toBe("http://myapp.local")
    // A port is a dev server by any other name.
    expect(normalizeUrl("dev.example.com:3000")).toBe("http://dev.example.com:3000")
    expect(normalizeUrl("example.com")).toBe("https://example.com")
  })

  it("searches for what is not host-shaped", () => {
    expect(normalizeUrl("how do i center a div")).toContain("duckduckgo.com")
    expect(normalizeUrl("")).toContain("duckduckgo.com")
  })

  it("treats a single label as a host once the machine says it resolves", () => {
    // `myapp` is both a plausible search and exactly what an /etc/hosts alias
    // looks like. Only the resolver knows, so the answer is a parameter.
    expect(normalizeUrl("myapp")).toContain("duckduckgo.com")
    expect(normalizeUrl("myapp", true)).toBe("http://myapp")
    expect(normalizeUrl("myapp:3000", true)).toBe("http://myapp:3000")
    expect(normalizeUrl("time:30")).toContain("duckduckgo.com")
    expect(normalizeUrl("myapp/admin", true)).toBe("http://myapp/admin")
  })

  it("only asks the resolver about the case it cannot decide", () => {
    // Worth a round trip: a bare label.
    expect(singleLabelHost("myapp")).toBe("myapp")
    expect(singleLabelHost("myapp/admin")).toBe("myapp")
    // Not worth one: already decidable, or not a name at all.
    expect(singleLabelHost("myapp.test")).toBeNull()
    // A port does not settle it: `myapp:3000` is a dev server, `time:30` is a
    // search, and only the resolver can say which.
    expect(singleLabelHost("myapp:3000")).toBe("myapp")
    expect(singleLabelHost("myapp:3000/admin")).toBe("myapp")
    expect(singleLabelHost("http://myapp")).toBeNull()
    expect(singleLabelHost("localhost")).toBeNull()
    expect(singleLabelHost("how do i center a div")).toBeNull()
  })
})
