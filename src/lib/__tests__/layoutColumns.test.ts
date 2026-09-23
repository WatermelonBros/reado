import { describe, expect, it } from "vitest"
import { workbenchColumns } from "../layoutColumns"

const base = {
  showActivityBar: true,
  onRight: false,
  sidebar: true,
  sidebarWidth: 240,
  panelAlignment: "center" as const,
}

describe("workbenchColumns", () => {
  it("lays out activity bar, sidebar, editor, aux from the left", () => {
    const { columns, rowRegions, rowPanel } = workbenchColumns(base)
    expect(columns.map((c) => c.size)).toEqual(["auto", "240px", "minmax(0, 1fr)", "auto"])
    expect(rowRegions).toBe("act side edit aux")
    expect(rowPanel).toBe("act side panel aux")
  })

  it("mirrors the columns when the sidebar is on the right", () => {
    const { rowRegions, rowPanel } = workbenchColumns({ ...base, onRight: true })
    expect(rowRegions).toBe("edit aux side act")
    expect(rowPanel).toBe("panel aux side act")
  })

  it("spans the panel out to the requested edge, never over the activity bar", () => {
    expect(workbenchColumns({ ...base, panelAlignment: "left" }).rowPanel).toBe(
      "act panel panel aux",
    )
    expect(workbenchColumns({ ...base, panelAlignment: "right" }).rowPanel).toBe(
      "act side panel panel",
    )
    expect(workbenchColumns({ ...base, panelAlignment: "justify" }).rowPanel).toBe(
      "act panel panel panel",
    )
  })

  it("collapses 'left' to the editor when the editor is the leftmost column", () => {
    const { rowPanel } = workbenchColumns({ ...base, onRight: true, panelAlignment: "left" })
    expect(rowPanel).toBe("panel aux side act")
  })

  it("drops the sidebar and activity bar columns when they are hidden", () => {
    const { rowRegions } = workbenchColumns({ ...base, showActivityBar: false, sidebar: false })
    expect(rowRegions).toBe("edit aux")
  })
})
