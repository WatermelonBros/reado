/**
 * Dockable-panel layout — the model behind the "magnetic" panels.
 *
 * One layout tree replaces the ad-hoc bottom/right toggles. The editor is the
 * fixed centre; around it sit three dock **areas** (`left` / `right` / `bottom`).
 * An area holds an ordered list of **groups** laid along its cross-axis (left/right
 * split vertically, bottom splits horizontally); a group is a tabbed stack of
 * **panels**. A panel lives in exactly one group. Moving a panel to an area either
 * joins an existing group (as a tab) or splits a new group beside it.
 *
 * The reducer functions are pure (a Layout in, a Layout out) so the logic is unit
 * tested without React; the zustand store just wraps them and persists per project.
 *
 * ponytail: v1 registers only the movable panels that had ad-hoc positions —
 * `terminal` and `browser`. Tool panels stay on the activity bar for now; they
 * slot into this same model later by registering their PanelIds.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DockArea = "left" | "right" | "bottom";
export const AREAS: DockArea[] = ["left", "right", "bottom"];

/** A stable panel identity. v1: `"terminal"` and `"browser"`. */
export type PanelId = string;

/** A live drop target during a drag: an area + (for a group) its id, and whether
 *  dropping there stacks (into the group) or splits (a new group / empty area). */
export interface DropTarget {
  area: DockArea;
  groupId: string | null;
  zone: "stack" | "split";
}

export interface Group {
  id: string;
  tabs: PanelId[];
  active: PanelId;
  /** Size weight along the area's cross-axis (relative, normalised at render). */
  size: number;
}

export interface AreaState {
  groups: Group[];
  /** The area's extent (px): width for left/right, height for bottom. */
  size: number;
}

export interface Layout {
  areas: Record<DockArea, AreaState>;
}

/** Deterministic group ids (no Date/random in reducers) — a monotonic counter
 *  threaded through the store; reducers take the next id as an argument. */
export const DEFAULT_AREA_SIZE: Record<DockArea, number> = { left: 260, right: 640, bottom: 320 };

function emptyArea(area: DockArea): AreaState {
  return { groups: [], size: DEFAULT_AREA_SIZE[area] };
}

/** The migrated default: terminal docked bottom, browser docked to the right —
 *  matching today's arrangement. Both start closed; placement applies when open. */
export function defaultLayout(): Layout {
  return {
    areas: {
      left: emptyArea("left"),
      right: { groups: [{ id: "g-browser", tabs: ["browser"], active: "browser", size: 1 }], size: 640 },
      bottom: { groups: [{ id: "g-terminal", tabs: ["terminal"], active: "terminal", size: 1 }], size: 320 },
    },
  };
}

/** Where a panel currently lives, or null if it isn't placed anywhere. */
export function findPanel(layout: Layout, panel: PanelId): { area: DockArea; groupId: string } | null {
  for (const area of AREAS) {
    for (const g of layout.areas[area].groups) {
      if (g.tabs.includes(panel)) return { area, groupId: g.id };
    }
  }
  return null;
}

/** Deep-clone just enough of the tree that we never mutate the caller's state. */
function cloneLayout(layout: Layout): Layout {
  return {
    areas: {
      left: cloneArea(layout.areas.left),
      right: cloneArea(layout.areas.right),
      bottom: cloneArea(layout.areas.bottom),
    },
  };
}
function cloneArea(a: AreaState): AreaState {
  return { size: a.size, groups: a.groups.map((g) => ({ ...g, tabs: [...g.tabs] })) };
}

/** Remove `panel` from wherever it is; drop a group left empty, and keep each
 *  group's `active` tab valid. Returns a fresh layout (never mutates input). */
export function removePanel(layout: Layout, panel: PanelId): Layout {
  const next = cloneLayout(layout);
  for (const area of AREAS) {
    const a = next.areas[area];
    for (const g of a.groups) {
      const i = g.tabs.indexOf(panel);
      if (i === -1) continue;
      g.tabs.splice(i, 1);
      if (g.active === panel) g.active = g.tabs[Math.min(i, g.tabs.length - 1)] ?? "";
    }
    a.groups = a.groups.filter((g) => g.tabs.length > 0);
  }
  return next;
}

/**
 * Move `panel` to `area`. By default it joins the area's first group as a new
 * tab (stack); with `split: true` (or when the area is empty) it becomes its own
 * group beside the others. `targetGroupId` joins a specific group. `newGroupId`
 * supplies the id for a freshly-split group (the store passes its counter).
 */
export function movePanel(
  layout: Layout,
  panel: PanelId,
  area: DockArea,
  opts: { split?: boolean; targetGroupId?: string; newGroupId: string },
): Layout {
  const next = removePanel(layout, panel);
  const a = next.areas[area];
  const joinInto = opts.targetGroupId
    ? a.groups.find((g) => g.id === opts.targetGroupId)
    : opts.split
      ? undefined
      : a.groups[0];
  if (joinInto) {
    joinInto.tabs.push(panel);
    joinInto.active = panel;
  } else {
    a.groups.push({ id: opts.newGroupId, tabs: [panel], active: panel, size: 1 });
  }
  return next;
}

/** Make `panel` the active tab of its group (no-op if it isn't placed). */
export function activatePanel(layout: Layout, panel: PanelId): Layout {
  const at = findPanel(layout, panel);
  if (!at) return layout;
  const next = cloneLayout(layout);
  const g = next.areas[at.area].groups.find((g) => g.id === at.groupId)!;
  g.active = panel;
  return next;
}

/** Panels currently sharing an area (across its groups), in group+tab order. */
export function panelsInArea(layout: Layout, area: DockArea): PanelId[] {
  return layout.areas[area].groups.flatMap((g) => g.tabs);
}

// ── Store ────────────────────────────────────────────────────────────────────

interface LayoutStore {
  layout: Layout;
  /** Monotonic id source for new groups (deterministic; survives persist). */
  seq: number;
  /** The panel being dragged, or null — transient (not persisted), shared across
   *  dock regions so a drag from the bottom can drop on the right and vice-versa. */
  dragging: PanelId | null;
  setDragging: (panel: PanelId | null) => void;
  /** The dock target under the pointer during a drag (which area/group, and whether
   *  it would stack or split), or null. Global so the highlight shows in whichever
   *  region the pointer is over — the drag can cross from the bottom to the right. */
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  /** A dock menu is open — transient. The browser's native child window sits above
   *  the DOM, so the preview hides while this (or a drag) is active, keeping the
   *  menu and drop targets visible. */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  move: (panel: PanelId, area: DockArea, opts?: { split?: boolean; targetGroupId?: string }) => void;
  remove: (panel: PanelId) => void;
  activate: (panel: PanelId) => void;
  setAreaSize: (area: DockArea, size: number) => void;
  setGroupSize: (area: DockArea, groupId: string, size: number) => void;
  reset: () => void;
}

export const useLayout = create<LayoutStore>()(
  persist(
    (set, get) => ({
      layout: defaultLayout(),
      seq: 1,
      dragging: null,
      setDragging: (panel) => set({ dragging: panel }),
      dropTarget: null,
      setDropTarget: (t) => set({ dropTarget: t }),
      menuOpen: false,
      setMenuOpen: (open) => set({ menuOpen: open }),
      move: (panel, area, opts) => {
        const seq = get().seq + 1;
        set({ layout: movePanel(get().layout, panel, area, { ...opts, newGroupId: `g${seq}` }), seq });
      },
      remove: (panel) => set({ layout: removePanel(get().layout, panel) }),
      activate: (panel) => set({ layout: activatePanel(get().layout, panel) }),
      setAreaSize: (area, size) =>
        set((s) => {
          const layout = cloneLayout(s.layout);
          layout.areas[area].size = Math.max(120, size);
          return { layout };
        }),
      setGroupSize: (area, groupId, size) =>
        set((s) => {
          const layout = cloneLayout(s.layout);
          const g = layout.areas[area].groups.find((g) => g.id === groupId);
          if (g) g.size = Math.max(0.1, size);
          return { layout };
        }),
      reset: () => set({ layout: defaultLayout(), seq: get().seq + 1 }),
    }),
    // Persist only the arrangement, never the transient drag state.
    { name: "reado.layout", partialize: (s) => ({ layout: s.layout, seq: s.seq }) },
  ),
);
