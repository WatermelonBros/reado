// UI test: the terminal dock — tabs (groups), panes, the agent launcher row and
// the pane context menu. Each pane's xterm/PTY is stubbed; the terminal store is
// the real one, so tab and split behaviour is asserted against the real model.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../Terminal", () => ({
  Terminal: ({ id, active }: { id: string; active: boolean }) => (
    <div data-testid={`pty-${id}`}>{active ? "active" : "idle"}</div>
  ),
}))
vi.mock("../SendReviewDialog", () => ({
  SendReviewDialog: ({ open }: { open: boolean }) => (open ? <div>send-review</div> : null),
}))
vi.mock("../AuditDialog", () => ({
  AuditDialog: ({ target }: { target: { path: string } | null }) =>
    target ? <div>{`audit:${target.path}`}</div> : null,
}))

const launchAgent = vi.fn(async (_a: string, _b: string) => {})
vi.mock("../../../lib/agents", async (orig) => ({
  ...(await orig<typeof import("../../../lib/agents")>()),
  launchAgent: (a: string, b: string) => launchAgent(a, b),
}))

const agentInstalled = vi.fn(async (_bin: string) => true)
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  agentInstalled: (bin: string) => agentInstalled(bin),
}))

import { TerminalPanel } from "@/components/organisms/TerminalPanel"
import { AGENT_ORDER } from "@/lib/agents"
import { useComments } from "@/lib/comments"
import { defaultLayout, useLayout } from "@/lib/layout"
import { useProject } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** One group holding `n` panes, the first active. */
function withPanes(n: number, dir: "row" | "column" = "row") {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`)
  useTerminals.setState({
    sessions: ids.map((id, i) => ({ id, title: `Terminal ${i + 1}` })),
    groups: [{ id: "g1", dir, paneIds: ids, sizes: ids.map(() => 1 / n) }],
    activeGroupId: "g1",
    activeId: ids[0],
    open: true,
  })
  return ids
}

beforeEach(() => {
  vi.clearAllMocks()
  agentInstalled.mockResolvedValue(true)
  useLayout.setState({
    layout: defaultLayout(),
    hidden: { left: false, right: false, bottom: false },
  })
  useProject.setState({ root: "/repo", active: null })
  useComments.setState({ comments: [] })
  withPanes(1)
})

describe("tabs", () => {
  it("shows one tab per group, with the pane's title", () => {
    render(<TerminalPanel />)
    expect(screen.getByRole("tab", { name: /Terminal 1/ })).toBeInTheDocument()
  })

  it("counts the panes on a split tab", () => {
    withPanes(3)
    render(<TerminalPanel />)
    expect(within(screen.getByRole("tab")).getByText("3")).toBeInTheDocument()
  })

  it("switches groups on click", async () => {
    useTerminals.setState({
      sessions: [
        { id: "a", title: "Terminal 1" },
        { id: "b", title: "Terminal 2" },
      ],
      groups: [
        { id: "g1", dir: "row", paneIds: ["a"], sizes: [1] },
        { id: "g2", dir: "row", paneIds: ["b"], sizes: [1] },
      ],
      activeGroupId: "g1",
      activeId: "a",
    })
    render(<TerminalPanel />)
    await userEvent.click(screen.getByRole("tab", { name: /Terminal 2/ }))
    expect(useTerminals.getState().activeGroupId).toBe("g2")
  })

  it("marks the active tab for assistive tech", () => {
    render(<TerminalPanel />)
    expect(screen.getByRole("tab")).toHaveAttribute("aria-selected", "true")
  })

  it("opens a new terminal", async () => {
    render(<TerminalPanel />)
    await userEvent.click(screen.getByLabelText("terminal.new"))
    expect(useTerminals.getState().groups).toHaveLength(2)
  })

  it("splits the active group", async () => {
    render(<TerminalPanel />)
    await userEvent.click(screen.getByLabelText("terminal.split"))
    expect(useTerminals.getState().groups[0].paneIds).toHaveLength(2)
  })

  it("closes a whole tab from its close button", async () => {
    render(<TerminalPanel />)
    await userEvent.click(screen.getAllByLabelText("terminal.close")[0])
    expect(useTerminals.getState().groups).toHaveLength(0)
  })

  it("hides the panel without closing anything", async () => {
    render(<TerminalPanel />)
    await userEvent.click(screen.getByLabelText("terminal.hide"))
    expect(useTerminals.getState().open).toBe(false)
    expect(useTerminals.getState().sessions).toHaveLength(1)
  })
})

describe("panes", () => {
  it("keeps every pane mounted, so a PTY survives a tab switch", () => {
    useTerminals.setState({
      sessions: [
        { id: "a", title: "Terminal 1" },
        { id: "b", title: "Terminal 2" },
      ],
      groups: [
        { id: "g1", dir: "row", paneIds: ["a"], sizes: [1] },
        { id: "g2", dir: "row", paneIds: ["b"], sizes: [1] },
      ],
      activeGroupId: "g1",
      activeId: "a",
    })
    render(<TerminalPanel />)
    const a = screen.getByTestId("pty-a")
    // The other group's pane is mounted but taken out of the layout…
    expect(screen.getByTestId("pty-b").closest("div.hidden")).toBeTruthy()
    expect(a.closest("div.hidden")).toBeNull()

    // …and switching tabs keeps the very same DOM node — a remount would kill
    // the PTY behind it and lose the scrollback.
    fireEvent.click(screen.getByRole("tab", { name: /Terminal 2/ }))
    expect(screen.getByTestId("pty-a")).toBe(a)
    expect(screen.getByTestId("pty-b").closest("div.hidden")).toBeNull()
  })

  it("marks only the focused pane active", () => {
    withPanes(2)
    render(<TerminalPanel />)
    expect(screen.getByTestId("pty-p1")).toHaveTextContent("active")
    expect(screen.getByTestId("pty-p2")).toHaveTextContent("idle")
  })

  it("focuses a pane on mouse-down", () => {
    const ids = withPanes(2)
    render(<TerminalPanel />)
    fireEvent.mouseDown(screen.getByTestId(`pty-${ids[1]}`))
    expect(useTerminals.getState().activeId).toBe("p2")
  })

  it("offers a per-pane close only when the group is split", async () => {
    render(<TerminalPanel />)
    expect(screen.queryByLabelText("terminal.closePane")).not.toBeInTheDocument()
    withPanes(2)
    await waitFor(() => expect(screen.getAllByLabelText("terminal.closePane")).toHaveLength(2))
  })

  it("closes one pane and leaves the group", async () => {
    withPanes(2)
    render(<TerminalPanel />)
    await userEvent.click(screen.getAllByLabelText("terminal.closePane")[0])
    expect(useTerminals.getState().sessions.map((s) => s.id)).toEqual(["p2"])
    expect(useTerminals.getState().groups).toHaveLength(1)
  })

  it("flips the split orientation", async () => {
    withPanes(2)
    render(<TerminalPanel />)
    await userEvent.click(screen.getByLabelText("terminal.orientation"))
    expect(useTerminals.getState().groups[0].dir).toBe("column")
  })
})

describe("the pane context menu", () => {
  const openMenu = async (paneId: string) => {
    fireEvent.contextMenu(screen.getByTestId(`pty-${paneId}`))
    return await screen.findByRole("menu")
  }

  it("focuses the pane it was opened on", async () => {
    const ids = withPanes(2)
    render(<TerminalPanel />)
    await openMenu(ids[1])
    expect(useTerminals.getState().activeId).toBe("p2")
  })

  it("offers split-only actions on a single pane", async () => {
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    expect(within(menu).getByText("terminal.new")).toBeInTheDocument()
    expect(within(menu).queryByText("terminal.closePane")).not.toBeInTheDocument()
    expect(within(menu).queryByText("terminal.orientation")).not.toBeInTheDocument()
  })

  it("adds the pane-level actions once the group is split", async () => {
    withPanes(2)
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    expect(within(menu).getByText("terminal.closePane")).toBeInTheDocument()
    expect(within(menu).getByText("terminal.orientation")).toBeInTheDocument()
  })

  it("moves the panel to the other dock", async () => {
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    await userEvent.click(within(menu).getByText("terminal.moveRight"))
    expect(
      useLayout.getState().layout.areas.right.groups.some((g) => g.tabs.includes("terminal")),
    ).toBe(true)
  })
})

describe("the agent launchers", () => {
  it("offers one per agent, and launches its binary", async () => {
    render(<TerminalPanel />)
    // One button per agent, in AGENT_ORDER — Claude Code first.
    const launchers = await screen.findAllByLabelText("terminal.launch")
    expect(launchers).toHaveLength(AGENT_ORDER.length)
    await userEvent.click(launchers[0])
    expect(launchAgent).toHaveBeenCalledWith("claude-code", "claude")
    await userEvent.click(launchers[1])
    expect(launchAgent).toHaveBeenCalledWith("codex", "codex")
  })

  it("dims an agent that isn't on PATH", async () => {
    agentInstalled.mockImplementation(async (bin: string) => bin !== "codex")
    render(<TerminalPanel />)
    const missing = await screen.findAllByLabelText("agent.notInstalled")
    expect(missing).toHaveLength(1)
    expect(missing[0].className).toContain("opacity-40")
  })

  it("assumes installed while the probe is still running", async () => {
    agentInstalled.mockReturnValue(new Promise(() => {}))
    render(<TerminalPanel />)
    // Every launcher renders — and none of them dimmed — rather than nothing
    // rendering at all, which would pass the absence check just as well.
    expect(await screen.findAllByLabelText("terminal.launch")).toHaveLength(AGENT_ORDER.length)
    expect(screen.queryByLabelText("agent.notInstalled")).not.toBeInTheDocument()
  })
})

describe("review and audit", () => {
  it("won't send a review with no open tasks", () => {
    render(<TerminalPanel />)
    expect(screen.getByRole("button", { name: /terminal\.sendReview/ })).toBeDisabled()
  })

  it("sends one when there are, showing the count", async () => {
    useComments.setState({
      comments: [{ id: "c1", kind: "task", state: "open" }],
    } as unknown as Parameters<typeof useComments.setState>[0])
    render(<TerminalPanel />)
    const send = screen.getByRole("button", { name: /terminal\.sendReview/ })
    expect(within(send).getByText("1")).toBeInTheDocument()
    await userEvent.click(send)
    expect(await screen.findByText("send-review")).toBeInTheDocument()
  })

  it("audits the open file, or the project when nothing is open", async () => {
    render(<TerminalPanel />)
    await userEvent.click(screen.getByRole("button", { name: /comments\.audit/ }))
    expect(await screen.findByText("audit:.")).toBeInTheDocument()
  })

  it("audits the active file when there is one", async () => {
    useProject.setState({ active: "/repo/src/a.ts" })
    render(<TerminalPanel />)
    await userEvent.click(screen.getByRole("button", { name: /comments\.audit/ }))
    expect(await screen.findByText("audit:src/a.ts")).toBeInTheDocument()
  })
})

describe("docked vs self-sized", () => {
  it("owns its own size and position controls when not docked", () => {
    const { container } = render(<TerminalPanel />)
    expect(container.querySelector(".cursor-row-resize")).toBeTruthy()
    expect(screen.getByLabelText("terminal.moveRight")).toBeInTheDocument()
  })

  it("leaves both to the dock when docked", () => {
    const { container } = render(<TerminalPanel docked />)
    expect(container.querySelector(".cursor-row-resize")).toBeNull()
    expect(screen.queryByLabelText("terminal.moveRight")).not.toBeInTheDocument()
  })

  it("resizes itself by dragging its inner edge", () => {
    const { container } = render(<TerminalPanel />)
    const handle = container.querySelector(".cursor-row-resize") as HTMLElement
    fireEvent.pointerDown(handle, { clientY: 0 })
    // The height is the distance from the pointer to the bottom of the window,
    // clamped so the editor keeps 160px.
    fireEvent.pointerMove(window, { clientY: window.innerHeight - 300 })
    expect(useTerminals.getState().height).toBe(300)
    fireEvent.pointerMove(window, { clientY: 0 })
    expect(useTerminals.getState().height).toBe(window.innerHeight - 160)
    fireEvent.pointerUp(window)
  })
})

describe("the rest of the pane menu", () => {
  const openMenu = async (paneId: string) => {
    fireEvent.contextMenu(screen.getByTestId(`pty-${paneId}`))
    return await screen.findByRole("menu")
  }

  it("opens a new terminal from the menu", async () => {
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    await userEvent.click(within(menu).getByText("terminal.new"))
    expect(useTerminals.getState().groups).toHaveLength(2)
  })

  it("splits the active group from the menu", async () => {
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    await userEvent.click(within(menu).getByText("terminal.split"))
    expect(useTerminals.getState().groups[0].paneIds).toHaveLength(2)
  })

  it("closes a single pane from the menu", async () => {
    withPanes(2)
    render(<TerminalPanel />)
    const menu = await openMenu("p2")
    await userEvent.click(within(menu).getByText("terminal.closePane"))
    expect(useTerminals.getState().sessions.map((s) => s.id)).toEqual(["p1"])
  })

  it("closes the whole tab from the menu", async () => {
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    await userEvent.click(within(menu).getByText("terminal.close"))
    expect(useTerminals.getState().groups).toHaveLength(0)
  })

  it("flips the split orientation from the menu", async () => {
    withPanes(2)
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    await userEvent.click(within(menu).getByText("terminal.orientation"))
    expect(useTerminals.getState().groups[0].dir).toBe("column")
  })

  it("offers the other dock, whichever side it is on", async () => {
    useLayout.getState().move("terminal", "right", { split: true })
    render(<TerminalPanel />)
    const menu = await openMenu("p1")
    expect(within(menu).getByText("terminal.moveBottom")).toBeInTheDocument()
  })
})

describe("resizing the panes", () => {
  it("re-weights two adjacent panes as the divider is dragged", () => {
    withPanes(2)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const { container } = render(<TerminalPanel />)
    const divider = container.querySelector(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(divider, { clientX: 500 })
    fireEvent.pointerMove(window, { clientX: 700 })
    const [a, b] = useTerminals.getState().groups[0].sizes
    expect(a).toBeGreaterThan(b)
    expect(a + b).toBeCloseTo(1)
    fireEvent.pointerUp(window)
    vi.restoreAllMocks()
  })

  it("refuses to squeeze a pane below its floor", () => {
    withPanes(2)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const { container } = render(<TerminalPanel />)
    const divider = container.querySelector(".cursor-col-resize") as HTMLElement
    fireEvent.pointerDown(divider, { clientX: 500 })
    fireEvent.pointerMove(window, { clientX: -5000 })
    expect(useTerminals.getState().groups[0].sizes).toEqual([0.5, 0.5])
    // The same drag with a legal move must land — otherwise the untouched
    // sizes above are equally consistent with a divider that never dragged.
    fireEvent.pointerMove(window, { clientX: 600 })
    expect(useTerminals.getState().groups[0].sizes[0]).toBeGreaterThan(0.5)
    fireEvent.pointerUp(window)
    vi.restoreAllMocks()
  })

  it("has no divider with a single pane", () => {
    const { container } = render(<TerminalPanel />)
    expect(container.querySelector(".cursor-col-resize")).toBeNull()
  })
})
