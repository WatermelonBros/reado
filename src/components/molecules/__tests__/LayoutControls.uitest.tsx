// Title-bar layout controls: each toggle drives the store that owns its region
// and reflects its state, and the menu's rows are the same settings the Settings
// tab writes — not a second copy of them.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { LayoutControls } from "@/components/molecules/LayoutControls"
import { defaultLayout, useLayout } from "@/lib/layout"
import { usePreview } from "@/lib/preview"
import { useSettings, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

beforeEach(() => {
  useLayout.setState({
    layout: defaultLayout(),
    hidden: { left: false, right: false, bottom: false },
  })
  useWorkspace.setState({ tool: "files", lastTool: "files" })
  // The regions start placed but empty — the state the toggles used to lie
  // about, reporting "on" for a dock with nothing in it.
  useTerminals.setState({ open: false })
  usePreview.setState({ open: false })
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

  it("shows the panel by opening what lives in it", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.panel" })
    // Placed but empty is not "showing" — the region would be a bare strip.
    expect(btn).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(btn)
    expect(useTerminals.getState().open).toBe(true)
    expect(useLayout.getState().hidden.bottom).toBe(false)
    expect(btn).toHaveAttribute("aria-pressed", "true")
  })

  it("hides the panel without closing what lives there", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.panel" })
    await userEvent.click(btn) // show
    await userEvent.click(btn) // hide
    expect(useLayout.getState().hidden.bottom).toBe(true)
    expect(btn).toHaveAttribute("aria-pressed", "false")
    // Hiding is not closing: the terminal stays open — and, on screen, running —
    // so bringing the region back returns the shell you left, not a fresh one.
    expect(useTerminals.getState().open).toBe(true)
    expect(useLayout.getState().layout.areas.bottom.groups.length).toBeGreaterThan(0)
  })

  it("brings the same panel back", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.panel" })
    await userEvent.click(btn)
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(useLayout.getState().hidden.bottom).toBe(false)
    expect(useTerminals.getState().open).toBe(true)
    expect(btn).toHaveAttribute("aria-pressed", "true")
  })

  it("shows the secondary sidebar independently of the panel", async () => {
    render(<LayoutControls />)
    await userEvent.click(screen.getByRole("button", { name: "layout.secondarySidebar" }))
    expect(usePreview.getState().open).toBe(true)
    expect(useLayout.getState().hidden.right).toBe(false)
    // The panel is a separate region and stays as it was.
    expect(useTerminals.getState().open).toBe(false)
  })
})

describe("the layout menu", () => {
  const open = () => userEvent.click(screen.getByRole("button", { name: "layout.more" }))

  it("drives the same settings the Settings tab writes", async () => {
    render(<LayoutControls />)
    await open()
    await userEvent.click(await screen.findByText("layout.statusBar"))
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
    const row = (await screen.findByText("layout.breadcrumbs")).closest('[role="menuitemcheckbox"]')
    expect(row).toHaveAttribute("data-state", "unchecked")
  })

  it("names the shortcut that toggles each region, as VS Code does", async () => {
    render(<LayoutControls />)
    await open()
    const combo = async (label: string) =>
      (await screen.findByText(label)).closest('[role="menuitemcheckbox"]')?.textContent
    expect(await combo("layout.primarySidebar")).toMatch(/B$/)
    // The secondary sidebar's binding, and the panel's, are real — see
    // lib/hooks.ts. A menu that named keys nothing listens for would be worse
    // than one that named none.
    expect(await combo("layout.secondarySidebar")).toMatch(/B$/)
    expect(await combo("layout.panel")).toMatch(/J$/)
  })

  it("stays open while regions are flipped", async () => {
    render(<LayoutControls />)
    await open()
    await userEvent.click(await screen.findByText("layout.activityBar"))
    expect(useSettings.getState().showActivityBar).toBe(false)
    // A control panel that dismissed itself per click would make the second
    // change cost another trip to the trigger.
    await userEvent.click(await screen.findByText("layout.statusBar"))
    expect(useSettings.getState().showStatusBar).toBe(false)
  })
})
