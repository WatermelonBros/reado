// Title-bar layout controls: each toggle drives the store that owns its region
// and reflects its state, and the popover's controls are the same settings the
// Settings tab writes — not a second copy of them.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { LayoutControls } from "@/components/molecules/LayoutControls"
import { defaultLayout, useLayout } from "@/lib/layout"
import { useSettings, useWorkspace } from "@/lib/store"

beforeEach(() => {
  useLayout.setState({
    layout: defaultLayout(),
    hidden: { left: false, right: false, bottom: false },
  })
  useWorkspace.setState({ tool: "files", lastTool: "files" })
  useSettings.getState().set({
    showActivityBar: true,
    showStatusBar: true,
    showBreadcrumbs: true,
    sidebarSide: "left",
  })
})

describe("region toggles", () => {
  it("collapses the primary sidebar and shows it as hidden", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.primarySidebar" })
    expect(btn).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(btn)
    expect(useWorkspace.getState().tool).toBeNull()
    expect(btn).toHaveAttribute("aria-pressed", "false")
  })

  it("restores the sidebar to the tool it was showing", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.primarySidebar" })
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(useWorkspace.getState().tool).toBe("files")
  })

  it("hides the panel without closing what lives there", async () => {
    render(<LayoutControls />)
    await userEvent.click(screen.getByRole("button", { name: "layout.panel" }))
    expect(useLayout.getState().hidden.bottom).toBe(true)
    // The dock keeps its panels — hiding is not the same as closing them.
    expect(useLayout.getState().layout.areas.bottom.groups.length).toBeGreaterThan(0)
  })

  it("hides the secondary sidebar independently of the panel", async () => {
    render(<LayoutControls />)
    await userEvent.click(screen.getByRole("button", { name: "layout.secondarySidebar" }))
    expect(useLayout.getState().hidden.right).toBe(true)
    expect(useLayout.getState().hidden.bottom).toBe(false)
  })
})

describe("the layout popover", () => {
  const open = () => userEvent.click(screen.getByRole("button", { name: "layout.more" }))

  it("drives the same settings the Settings tab writes", async () => {
    render(<LayoutControls />)
    await open()
    await userEvent.click(await screen.findByText("settings.showStatusBar"))
    expect(useSettings.getState().showStatusBar).toBe(false)
  })

  it("moves the primary sidebar to the other edge", async () => {
    render(<LayoutControls />)
    await open()
    await userEvent.click(await screen.findByText("layout.right"))
    expect(useSettings.getState().sidebarSide).toBe("right")
  })

  it("reflects a setting changed elsewhere", async () => {
    useSettings.getState().set({ showBreadcrumbs: false })
    render(<LayoutControls />)
    await open()
    const box = (await screen.findByText("settings.showBreadcrumbs")).closest("label")
    expect(box).toHaveAttribute("data-state", "unchecked")
  })
})
