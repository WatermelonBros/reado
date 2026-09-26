// Which panels count as "on screen". The distinction matters because a panel
// that is placed in the layout but not actually showing must not be reported as
// open — the dock would then refuse to open it when the user clicks its tab.
import { beforeEach, describe, expect, it } from "vitest"
import { findPanel, useLayout } from "@/lib/layout"
import { isAreaShowing, isPanelOpen, revealPanel, toggleDockArea } from "@/lib/panels"
import { usePreview } from "@/lib/preview"
import { useTerminals } from "@/lib/terminals"

beforeEach(() => {
  usePreview.setState({ open: false, inspector: false, inspectorDetached: false })
  useTerminals.setState({ open: false })
})

describe("isPanelOpen", () => {
  it("reports the inspector open only once it is detached into its own pane", () => {
    // Embedded in the browser pane, the inspector is on screen as part of that
    // pane — but its *dock panel* is not, and reporting it open leaves the
    // console tab dead.
    usePreview.setState({ inspector: true, inspectorDetached: false })
    expect(isPanelOpen("inspector")).toBe(false)

    usePreview.setState({ inspector: true, inspectorDetached: true })
    expect(isPanelOpen("inspector")).toBe(true)
  })

  it("follows the terminal and browser panes' own open flags", () => {
    expect(isPanelOpen("terminal")).toBe(false)
    useTerminals.setState({ open: true })
    expect(isPanelOpen("terminal")).toBe(true)

    expect(isPanelOpen("browser")).toBe(false)
    usePreview.setState({ open: true })
    expect(isPanelOpen("browser")).toBe(true)
  })
})

/** The layout a dev session was left in: the browser behind the terminal at the
 *  bottom, nothing on the right. */
function browserBehindTerminal() {
  useLayout.setState({
    layout: {
      areas: {
        left: { size: 260, groups: [] },
        right: { size: 560, groups: [] },
        bottom: {
          size: 220,
          groups: [
            { id: "g3", tabs: ["output", "browser", "terminal"], active: "terminal", size: 1 },
          ],
        },
      },
    },
    hidden: { left: false, right: false, bottom: false },
  })
}

describe("showing the browser", () => {
  it("brings it in front of the tab it shares a group with", () => {
    browserBehindTerminal()
    revealPanel("browser")
    expect(useLayout.getState().layout.areas.bottom.groups[0].active).toBe("browser")
    expect(usePreview.getState().open).toBe(true)
  })

  it("the right panel toggle, on an empty right, brings the browser back there", () => {
    browserBehindTerminal()
    toggleDockArea("right", true)
    expect(findPanel(useLayout.getState().layout, "browser")?.area).toBe("right")
    expect(isAreaShowing("right")).toBe(true)
  })
})
