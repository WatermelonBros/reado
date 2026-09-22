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
    // The panel region always has something in it — Output is docked there, like
    // VS Code's — so the toggle reports it showing from the start.
    expect(btn).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(btn) // hide
    await userEvent.click(btn) // and back
    // Coming back opens the group's *active* tab: the terminal, not whichever
    // sibling tab happened to count as open.
    expect(useTerminals.getState().open).toBe(true)
    expect(useLayout.getState().hidden.bottom).toBe(false)
    expect(btn).toHaveAttribute("aria-pressed", "true")
  })

  it("hides the panel without closing what lives there", async () => {
    render(<LayoutControls />)
    const btn = screen.getByRole("button", { name: "layout.panel" })
    await userEvent.click(btn) // hide
    await userEvent.click(btn) // show
    await userEvent.click(btn) // hide again
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
    await userEvent.click(btn) // hide
    await userEvent.click(btn) // show
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

  it("opens outside the app's own tree, where the browser pane can be moved for it", async () => {
    // The pane is a native window painting above all DOM: a layer rendered
    // *inside* the app is one the page covers, with no way to reorder them. Being
    // a portal at body level is both what positions it correctly under interface
    // zoom and what lets `watchOverlays` see it — without this menu, or any other,
    // having to register anywhere.
    const { container } = render(<LayoutControls />)
    await open()
    const menu = await screen.findByRole("menu")
    expect(container.contains(menu)).toBe(false)
    expect(document.body.contains(menu)).toBe(true)
  })

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
