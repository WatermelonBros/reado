// Which panels count as "on screen". The distinction matters because a panel
// that is placed in the layout but not actually showing must not be reported as
// open — the dock would then refuse to open it when the user clicks its tab.
import { beforeEach, describe, expect, it } from "vitest"
import { isPanelOpen } from "@/lib/panels"
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
