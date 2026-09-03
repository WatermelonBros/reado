// UI test: a dock area rendered from the layout model — which panels show, the
// strip and its move menu, pointer-drag to stack/split, and the resize handles.
// The panel bodies are stubbed (a real terminal owns a PTY); the layout store is
// the real one, so what's asserted is the model the drag actually produces.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../TerminalPanel", () => ({ TerminalPanel: () => <div>terminal-body</div> }))
vi.mock("../BrowserPanel", () => ({ BrowserPanel: () => <div>browser-body</div> }))
vi.mock("../BrowserInspector", () => ({ BrowserInspector: () => <div>inspector-body</div> }))
vi.mock("../ReasoningPanel", () => ({ ReasoningPanel: () => <div>reasoning-body</div> }))
vi.mock("../ToolPanelBody", async (orig) => ({
  ...(await orig<typeof import("../ToolPanelBody")>()),
  ToolPanelBody: ({ tool }: { tool: string }) => <div>{`tool-body:${tool}`}</div>,
}))

import { DockRegion } from "@/components/organisms/DockRegion"
import { defaultLayout, type Layout, useLayout } from "@/lib/layout"
import { usePreview } from "@/lib/preview"
import { useReasoning } from "@/lib/reasoning"
import { useTerminals } from "@/lib/terminals"

/** A layout with the given groups in one area, everything else empty. */
function layoutWith(area: "right" | "bottom", groups: Layout["areas"]["bottom"]["groups"]): Layout {
  const l = defaultLayout()
  l.areas.right = { groups: [], size: 640 }
  l.areas.bottom = { groups: [], size: 320 }
  l.areas[area] = { groups, size: area === "bottom" ? 320 : 640 }
  return l
}

const group = (id: string, tabs: string[], size = 1) => ({ id, tabs, active: tabs[0], size })

beforeEach(() => {
  vi.clearAllMocks()
  useLayout.setState({
    layout: layoutWith("bottom", [group("g1", ["terminal"])]),
    hidden: { left: false, right: false, bottom: false },
    dragging: null,
    dropTarget: null,
    menuOpen: false,
    seq: 1,
  })
  useTerminals.setState({ open: true })
  usePreview.setState({ open: false, inspector: false, inspectorDetached: false })
  useReasoning.setState({ open: false })
})

describe("what the area renders", () => {
  it("renders the open panel placed in it, named on its strip", () => {
    render(<DockRegion area="bottom" />)
    expect(screen.getByText("dock.terminal")).toBeInTheDocument()
    expect(screen.getByText("terminal-body")).toBeInTheDocument()
  })

  it("renders nothing for an area with no panels", () => {
    const { container } = render(<DockRegion area="right" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when the only placed panel is closed", () => {
    useTerminals.setState({ open: false })
    const { container } = render(<DockRegion area="bottom" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the browser once it is open", () => {
    useLayout.setState({ layout: layoutWith("right", [group("g1", ["browser"])]) })
    usePreview.setState({ open: true })
    render(<DockRegion area="right" />)
    expect(screen.getByText("browser-body")).toBeInTheDocument()
  })

  it("shows the console only while it is both on and detached", () => {
    useLayout.setState({ layout: layoutWith("right", [group("g1", ["inspector"])]) })
    usePreview.setState({ inspector: true, inspectorDetached: false })
    const { container, rerender } = render(<DockRegion area="right" />)
    expect(container).toBeEmptyDOMElement()
    usePreview.setState({ inspectorDetached: true })
    rerender(<DockRegion area="right" />)
    expect(screen.getByText("inspector-body")).toBeInTheDocument()
  })

  it("treats a docked tool panel as open by virtue of being placed", () => {
    useLayout.setState({ layout: layoutWith("right", [group("g1", ["search"])]) })
    render(<DockRegion area="right" />)
    expect(screen.getByText("tool-body:search")).toBeInTheDocument()
  })

  it("renders a stack's active tab, with the other tab still on the strip", () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("bottom", [
        { id: "g1", tabs: ["terminal", "browser"], active: "browser", size: 1 },
      ]),
    })
    render(<DockRegion area="bottom" />)
    expect(screen.getByText("browser-body")).toBeInTheDocument()
    expect(screen.queryByText("terminal-body")).not.toBeInTheDocument()
    expect(screen.getByText("dock.terminal")).toBeInTheDocument()
  })

  it("falls back to a still-open tab when the active one was closed", () => {
    usePreview.setState({ open: false })
    useLayout.setState({
      layout: layoutWith("bottom", [
        { id: "g1", tabs: ["terminal", "browser"], active: "browser", size: 1 },
      ]),
    })
    render(<DockRegion area="bottom" />)
    expect(screen.getByText("terminal-body")).toBeInTheDocument()
  })

  it("steps out of the layout when collapsed, without unmounting the panel", () => {
    useLayout.setState({ hidden: { left: false, right: false, bottom: true } })
    const { container } = render(<DockRegion area="bottom" />)
    // Still mounted — unmounting a terminal would kill its PTY.
    expect(screen.getByText("terminal-body")).toBeInTheDocument()
    expect((container.firstChild as HTMLElement).style.display).toBe("none")
  })

  it("comes back on screen while something is being dragged into it", () => {
    useLayout.setState({
      hidden: { left: false, right: false, bottom: true },
      dragging: "browser",
    })
    const { container } = render(<DockRegion area="bottom" />)
    expect((container.firstChild as HTMLElement).style.display).not.toBe("none")
  })
})

describe("the empty-area drop rail", () => {
  it("only appears while a panel is being dragged", () => {
    const { rerender } = render(<DockRegion area="right" />)
    expect(screen.queryByText("dock.dropHere")).not.toBeInTheDocument()
    useLayout.setState({ dragging: "terminal" })
    rerender(<DockRegion area="right" />)
    expect(screen.getByText("dock.dropHere")).toBeInTheDocument()
  })

  it("highlights when the pointer is over it", () => {
    useLayout.setState({
      dragging: "terminal",
      dropTarget: { area: "right", groupId: null, zone: "split" },
    })
    render(<DockRegion area="right" />)
    expect(screen.getByText("dock.dropHere").className).toContain("border-accent")
  })
})

describe("the drop highlights", () => {
  it("marks the strip when a drop would stack onto this group", () => {
    useLayout.setState({
      dragging: "browser",
      dropTarget: { area: "bottom", groupId: "g1", zone: "stack" },
    })
    const { container } = render(<DockRegion area="bottom" />)
    expect(container.querySelector("[data-dock-strip]")?.className).toContain("border-accent")
  })

  it("marks the body when a drop would split a new group beside it", () => {
    useLayout.setState({
      dragging: "browser",
      dropTarget: { area: "bottom", groupId: "g1", zone: "split" },
    })
    render(<DockRegion area="bottom" />)
    expect(screen.getByText("dock.split")).toBeInTheDocument()
  })
})

describe("dragging a tab", () => {
  /** Press, move past the threshold, and release over `dropAt`'s element. */
  const drag = (tab: HTMLElement, target: HTMLElement | null) => {
    vi.spyOn(document, "elementFromPoint").mockReturnValue(target)
    fireEvent.pointerDown(tab, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }

  it("a press without movement just activates the tab", () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("bottom", [
        { id: "g1", tabs: ["terminal", "browser"], active: "browser", size: 1 },
      ]),
    })
    render(<DockRegion area="bottom" />)
    fireEvent.pointerDown(screen.getByText("dock.terminal"), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
    expect(useLayout.getState().layout.areas.bottom.groups[0].active).toBe("terminal")
  })

  it("dropping on another group's strip stacks the panel there", () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("bottom", [group("g1", ["terminal"]), group("g2", ["browser"])]),
    })
    const { container } = render(<DockRegion area="bottom" />)
    const strips = container.querySelectorAll<HTMLElement>("[data-dock-strip]")
    drag(screen.getByText("dock.terminal"), strips[1])
    const groups = useLayout.getState().layout.areas.bottom.groups
    expect(groups).toHaveLength(1)
    expect(groups[0].tabs).toEqual(["browser", "terminal"])
    vi.restoreAllMocks()
  })

  it("dropping on another group's body splits a new group beside it", () => {
    usePreview.setState({ open: true })
    useReasoning.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("bottom", [
        group("g1", ["terminal"]),
        { id: "g2", tabs: ["browser", "reasoning"], active: "browser", size: 1 },
      ]),
    })
    const { container } = render(<DockRegion area="bottom" />)
    // The body of the *other* group — not its strip, which would stack instead.
    const otherBody = container.querySelectorAll<HTMLElement>("[data-dock-cell]")[1]
    drag(screen.getByText("dock.terminal"), otherBody)
    const groups = useLayout.getState().layout.areas.bottom.groups
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.tabs)).toEqual([["browser", "reasoning"], ["terminal"]])
    vi.restoreAllMocks()
  })

  it("dropping on an empty area's rail moves the panel there", () => {
    render(<DockRegion area="bottom" />)
    const rail = document.createElement("div")
    rail.setAttribute("data-dock-rail", "")
    rail.dataset.area = "right"
    document.body.appendChild(rail)
    drag(screen.getByText("dock.terminal"), rail)
    expect(useLayout.getState().layout.areas.right.groups[0].tabs).toEqual(["terminal"])
    expect(useLayout.getState().layout.areas.bottom.groups).toHaveLength(0)
    rail.remove()
    vi.restoreAllMocks()
  })

  it("dropping back on its own group changes nothing", () => {
    const before = useLayout.getState().layout
    const { container } = render(<DockRegion area="bottom" />)
    const strip = container.querySelector<HTMLElement>("[data-dock-strip]")
    drag(screen.getByText("dock.terminal"), strip)
    expect(useLayout.getState().layout).toEqual(before)
    vi.restoreAllMocks()
  })

  it("clears the drag state even when the drop goes nowhere", () => {
    render(<DockRegion area="bottom" />)
    // Inlined rather than using `drag`, so the drag is observed *while* it is
    // live — otherwise both assertions below are just the initial state.
    vi.spyOn(document, "elementFromPoint").mockReturnValue(null)
    fireEvent.pointerDown(screen.getByText("dock.terminal"), {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    expect(useLayout.getState().dragging).toBe("terminal")

    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
    expect(useLayout.getState().dragging).toBeNull()
    expect(useLayout.getState().dropTarget).toBeNull()
    vi.restoreAllMocks()
  })
})

describe("the strip menu", () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByLabelText("dock.menu"))
    return await screen.findByRole("menu")
  }

  it("offers the moves that would actually change where the panel lives", async () => {
    render(<DockRegion area="bottom" />)
    const menu = await openMenu()
    expect(within(menu).getByText("dock.moveRight")).toBeInTheDocument()
    expect(within(menu).queryByText("dock.moveBottom")).not.toBeInTheDocument()
  })

  it("moves the panel to the other area", async () => {
    render(<DockRegion area="bottom" />)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByText("dock.moveRight"))
    expect(useLayout.getState().layout.areas.right.groups[0].tabs).toEqual(["terminal"])
    expect(useLayout.getState().layout.areas.bottom.groups).toHaveLength(0)
  })

  it("offers to stack with the other open panel when it sits elsewhere", async () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: (() => {
        const l = layoutWith("bottom", [group("g1", ["terminal"])])
        l.areas.right = { groups: [group("g2", ["browser"])], size: 640 }
        return l
      })(),
    })
    render(<DockRegion area="bottom" />)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByText("dock.stackWith"))
    expect(useLayout.getState().layout.areas.right.groups[0].tabs).toEqual(["browser", "terminal"])
  })

  it("closing the terminal panel turns the terminal off rather than losing it", async () => {
    render(<DockRegion area="bottom" />)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByText("dock.close"))
    expect(useTerminals.getState().open).toBe(false)
    // Still placed: reopening puts it back where it was.
    expect(useLayout.getState().layout.areas.bottom.groups[0].tabs).toEqual(["terminal"])
  })

  it("closing a docked tool panel removes it from the layout", async () => {
    useLayout.setState({ layout: layoutWith("right", [group("g1", ["search"])]) })
    render(<DockRegion area="right" />)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByText("dock.close"))
    expect(useLayout.getState().layout.areas.right.groups).toHaveLength(0)
  })

  it("resets the arrangement, folding the detached console back in", async () => {
    usePreview.setState({ inspectorDetached: true })
    useLayout.setState({ layout: layoutWith("bottom", [group("g9", ["terminal"])]) })
    render(<DockRegion area="bottom" />)
    const menu = await openMenu()
    await userEvent.click(within(menu).getByText("dock.reset"))
    expect(usePreview.getState().inspectorDetached).toBe(false)
    expect(useLayout.getState().layout).toEqual(defaultLayout())
  })

  it("tells the preview a menu is open, so the native child window steps aside", async () => {
    render(<DockRegion area="bottom" />)
    await openMenu()
    expect(useLayout.getState().menuOpen).toBe(true)
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(useLayout.getState().menuOpen).toBe(false))
  })
})

describe("resizing", () => {
  // happy-dom reports every box as 0×0, and both handles size themselves from
  // measured pixels — give them a window-sized workbench to divide up.
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
  })
  afterEach(() => vi.restoreAllMocks())

  it("drags the whole area bigger, and never past the editor's floor", () => {
    const { container } = render(<DockRegion area="bottom" />)
    const handle = container.querySelector<HTMLElement>(".cursor-row-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(window, { clientY: 400 }) // dragged up → taller
    expect(useLayout.getState().layout.areas.bottom.size).toBeGreaterThan(320)
    // All the way up: the dock stops short so the editor keeps 160px of itself.
    fireEvent.pointerMove(window, { clientY: -5000 })
    expect(useLayout.getState().layout.areas.bottom.size).toBe(800 - 160)
    fireEvent.pointerUp(window)
  })

  it("stops shrinking at the minimum", () => {
    const { container } = render(<DockRegion area="bottom" />)
    const handle = container.querySelector<HTMLElement>(".cursor-row-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(window, { clientY: 5000 })
    expect(useLayout.getState().layout.areas.bottom.size).toBe(120)
    fireEvent.pointerUp(window)
  })

  it("re-weights two adjacent groups", () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("bottom", [group("g1", ["terminal"]), group("g2", ["browser"])]),
    })
    const { container } = render(<DockRegion area="bottom" />)
    const splitter = container.querySelector<HTMLElement>(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(splitter, { clientX: 200 })
    fireEvent.pointerMove(window, { clientX: 260 })
    const [a, b] = useLayout.getState().layout.areas.bottom.groups
    expect(a.size + b.size).toBeCloseTo(2)
    expect(a.size).toBeGreaterThan(b.size)
    fireEvent.pointerUp(window)
  })
})

describe("the right dock", () => {
  it("stacks its groups vertically, with a row-resize splitter", () => {
    usePreview.setState({ open: true })
    useLayout.setState({
      layout: layoutWith("right", [group("g1", ["browser"]), group("g2", ["terminal"])]),
    })
    const { container } = render(<DockRegion area="right" />)
    expect(container.querySelector(".cursor-row-resize")).toBeTruthy()
    expect((container.firstChild as HTMLElement).className).toContain("flex-col")
  })

  it("sizes itself by width, not height", () => {
    useLayout.setState({ layout: layoutWith("right", [group("g1", ["terminal"])]) })
    const { container } = render(<DockRegion area="right" />)
    const region = container.firstChild as HTMLElement
    expect(region.style.width).toBe("640px")
    // The bottom dock is the one that takes a height; this one must not.
    expect(region.style.height).toBe("")
  })

  it("its rail is a vertical strip while something is dragged", () => {
    useLayout.setState({ dragging: "terminal" })
    render(<DockRegion area="right" />)
    expect(screen.getByText("dock.dropHere").className).toContain("w-40")
  })
})

describe("the reasoning panel", () => {
  it("shows only while the feed is open", () => {
    useLayout.setState({ layout: layoutWith("bottom", [group("g1", ["reasoning"])]) })
    const { container, unmount } = render(<DockRegion area="bottom" />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    useReasoning.setState({ open: true })
    render(<DockRegion area="bottom" />)
    expect(screen.getByText("reasoning-body")).toBeInTheDocument()
  })

  it("closing it turns the feed off", async () => {
    useReasoning.setState({ open: true })
    useLayout.setState({ layout: layoutWith("bottom", [group("g1", ["reasoning"])]) })
    render(<DockRegion area="bottom" />)
    await userEvent.click(screen.getByLabelText("dock.menu"))
    await userEvent.click(within(await screen.findByRole("menu")).getByText("dock.close"))
    expect(useReasoning.getState().open).toBe(false)
  })

  it("closing the browser closes the preview pane", async () => {
    usePreview.setState({ open: true })
    useLayout.setState({ layout: layoutWith("bottom", [group("g1", ["browser"])]) })
    render(<DockRegion area="bottom" />)
    await userEvent.click(screen.getByLabelText("dock.menu"))
    await userEvent.click(within(await screen.findByRole("menu")).getByText("dock.close"))
    expect(usePreview.getState().open).toBe(false)
  })

  it("closing the console folds it back into the browser pane", async () => {
    usePreview.setState({ inspector: true, inspectorDetached: true })
    useLayout.setState({ layout: layoutWith("bottom", [group("g1", ["inspector"])]) })
    render(<DockRegion area="bottom" />)
    await userEvent.click(screen.getByLabelText("dock.menu"))
    await userEvent.click(within(await screen.findByRole("menu")).getByText("dock.close"))
    expect(usePreview.getState().inspectorDetached).toBe(false)
    expect(usePreview.getState().inspector).toBe(false)
  })

  it("renders nothing for a panel id it doesn't know", () => {
    useLayout.setState({ layout: layoutWith("bottom", [group("g1", ["mystery"])]) })
    const { container } = render(<DockRegion area="bottom" />)
    // An id that is neither a tool nor one of the four panels is never "open",
    // so its group is filtered out rather than drawn as an empty strip.
    expect(container).toBeEmptyDOMElement()
  })
})

describe("the area clamp", () => {
  it("pulls a persisted size back inside a window that shrank", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const l = layoutWith("bottom", [group("g1", ["terminal"])])
    l.areas.bottom.size = 900
    useLayout.setState({ layout: l })
    // The clamp measures the workbench, so the region has to sit inside one.
    const workbench = document.createElement("div")
    workbench.setAttribute("data-workbench", "")
    document.body.appendChild(workbench)
    render(<DockRegion area="bottom" />, { container: workbench })
    // The workbench is 300 tall and the editor keeps MIN_EDITOR_PX (160), so
    // the dock lands on exactly what is left, not merely "less than 900".
    expect(useLayout.getState().layout.areas.bottom.size).toBe(300 - 160)
    workbench.remove()
    vi.restoreAllMocks()
  })
})
