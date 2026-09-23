/** The workbench grid: its columns, and how far the bottom panel spans them. */
import type { PanelAlignment } from "./store"

export interface WorkbenchColumn {
  name: "act" | "side" | "edit" | "aux"
  size: string
}

/**
 * The workbench columns, in the order they appear on screen, and the two rows
 * of `grid-template-areas` over them. `aux` is always emitted: an `auto` track
 * whose region draws nothing is zero wide, which is cheaper than threading
 * DockRegion's own "should I render?" test up here.
 */
export function workbenchColumns({
  showActivityBar,
  onRight,
  sidebar,
  sidebarWidth,
  panelAlignment,
}: {
  showActivityBar: boolean
  /** The sidebar (and its activity bar) sit on the right edge. */
  onRight: boolean
  /** A tool panel is showing in the sidebar. */
  sidebar: boolean
  sidebarWidth: number
  panelAlignment: PanelAlignment
}): { columns: WorkbenchColumn[]; rowRegions: string; rowPanel: string } {
  const columns: WorkbenchColumn[] = [
    ...(showActivityBar && !onRight ? [{ name: "act" as const, size: "auto" }] : []),
    ...(sidebar && !onRight ? [{ name: "side" as const, size: `${sidebarWidth}px` }] : []),
    { name: "edit", size: "minmax(0, 1fr)" },
    { name: "aux", size: "auto" },
    ...(sidebar && onRight ? [{ name: "side" as const, size: `${sidebarWidth}px` }] : []),
    ...(showActivityBar && onRight ? [{ name: "act" as const, size: "auto" }] : []),
  ]
  // Panel alignment, as VS Code means it: the panel always covers the editor,
  // and the setting says how much further out it runs. The activity bar is
  // never covered — it is the window's spine, not a region of the workbench —
  // so the span is measured over the other columns only. With the sidebar moved
  // to the right edge the editor *is* the leftmost column, and "left"
  // correctly collapses to "center".
  const body = columns.map((c, i) => ({ ...c, i })).filter((c) => c.name !== "act")
  const editAt = body.findIndex((c) => c.name === "edit")
  const toLeft = panelAlignment === "left" || panelAlignment === "justify"
  const toRight = panelAlignment === "right" || panelAlignment === "justify"
  const from = body[toLeft ? 0 : editAt].i
  const to = body[toRight ? body.length - 1 : editAt].i
  const rowRegions = columns.map((c) => c.name).join(" ")
  const rowPanel = columns
    .map((c, i) => (c.name !== "act" && i >= from && i <= to ? "panel" : c.name))
    .join(" ")
  return { columns, rowRegions, rowPanel }
}
