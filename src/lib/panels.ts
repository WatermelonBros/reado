/**
 * Whether a docked panel is on screen, and how to put it there.
 *
 * A dock area's visibility and a panel's own "open" flag are two different
 * switches living in two different stores, and every place that showed an area
 * flipped only the first one. So the title bar's toggles looked dead: pressing
 * one un-hid an area whose panels were all closed — an empty region — and then
 * reported itself *active*, because "not hidden" was being read as "on screen".
 * This module is the one place that knows both switches, so a caller asks for
 * "show the panel" and gets a panel, and asks "is it showing?" and gets the
 * truth.
 *
 * Tool panels have no flag of their own: being placed in the layout *is* being
 * open, which is why they always report open here.
 */
import { type DockArea, type PanelId, useLayout } from "./layout"
import { usePreview } from "./preview"
import { useReasoning } from "./reasoning"
import { useTerminals } from "./terminals"

/** The four panels that carry their own visibility, read together — so the
 *  imperative check and the React hook below share one answer instead of two
 *  copies that drift. */
interface Flags {
  terminal: boolean
  browser: boolean
  inspector: boolean
  reasoning: boolean
}

const isOpen = (f: Flags, id: PanelId): boolean =>
  id === "terminal"
    ? f.terminal
    : id === "browser"
      ? f.browser
      : id === "inspector"
        ? f.inspector
        : id === "reasoning"
          ? f.reasoning
          : // Anything else is a tool panel: it has no flag, so being placed is
            // being open.
            true

function flags(): Flags {
  const p = usePreview.getState()
  return {
    terminal: useTerminals.getState().open,
    browser: p.open,
    // The console shows as a dock panel only when it's both on and detached.
    inspector: p.inspector && p.inspectorDetached,
    reasoning: useReasoning.getState().open,
  }
}

const areaHasContent = (f: Flags, area: DockArea): boolean =>
  useLayout.getState().layout.areas[area].groups.some((g) => g.tabs.some((id) => isOpen(f, id)))

/** Is this panel currently showing content? */
export function isPanelOpen(id: PanelId): boolean {
  return isOpen(flags(), id)
}

/** Open a panel — a no-op for the ones that are open by virtue of being placed. */
export function openPanel(id: PanelId): void {
  if (id === "terminal") useTerminals.getState().toggle(true)
  else if (id === "browser") usePreview.getState().openPane()
  else if (id === "inspector") {
    const p = usePreview.getState()
    p.setInspectorDetached(true)
    if (!p.inspector) p.toggleInspector()
  } else if (id === "reasoning" && !useReasoning.getState().open) {
    useReasoning.getState().toggle()
  }
}

/** Close every panel in an area — what "hide this region" means from a toggle
 *  that also opens it. The layout keeps them, so they come back where they were. */
function closeArea(area: DockArea): void {
  for (const g of useLayout.getState().layout.areas[area].groups) {
    for (const id of g.tabs) {
      if (id === "terminal") useTerminals.getState().toggle(false)
      else if (id === "browser") usePreview.getState().close()
      else if (id === "inspector") usePreview.getState().setInspectorDetached(false)
      else if (id === "reasoning") useReasoning.getState().close()
    }
  }
}

/**
 * Show or hide a whole dock region, the way the title bar's toggles mean it.
 *
 * Showing an area whose panels are all closed used to reveal an empty strip and
 * call it done. Each group gets its active panel opened instead; hiding closes
 * them again, so the button and the region agree about what it did.
 */
export function toggleDockArea(area: DockArea, show?: boolean): void {
  const next = show ?? !isAreaShowing(area)
  useLayout.getState().toggleArea(area, !next)
  if (next) {
    for (const g of useLayout.getState().layout.areas[area].groups) {
      if (!g.tabs.some(isPanelOpen)) openPanel(g.active)
    }
  } else {
    closeArea(area)
  }
}

/** Is the region actually on screen — not hidden, and with something in it? */
export function isAreaShowing(area: DockArea): boolean {
  return !useLayout.getState().hidden[area] && areaHasContent(flags(), area)
}

/** The same question, as a subscription — so a toggle stops looking pressed the
 *  moment its region empties, however that happened. */
export function useAreaShowing(area: DockArea): boolean {
  const hidden = useLayout((s) => s.hidden[area])
  const groups = useLayout((s) => s.layout.areas[area].groups)
  const f: Flags = {
    terminal: useTerminals((s) => s.open),
    browser: usePreview((s) => s.open),
    inspector: usePreview((s) => s.inspector && s.inspectorDetached),
    reasoning: useReasoning((s) => s.open),
  }
  return !hidden && groups.some((g) => g.tabs.some((id) => isOpen(f, id)))
}
