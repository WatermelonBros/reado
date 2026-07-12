/**
 * A dock area (`right` or `bottom`) rendered from the layout model. It lays out
 * the *open* panels placed in the area as resizable groups — side-by-side in the
 * bottom, stacked vertically on the right — each group a tabbed stack. A slim
 * dock strip per group carries the panel name(s) and a move menu, and is the drag
 * handle: drag it onto another group's strip to stack, onto its body to split a
 * new group beside it. This is what lets the browser sit beside the terminal.
 *
 * Dragging is pointer-based (not HTML5 drag-and-drop): WKWebView, which Tauri uses
 * on macOS, fires HTML5 `dragstart` but often drops `dragend`/`drop`, which would
 * strand the drag state. Pointer events fire reliably, and `elementFromPoint`
 * resolves the drop target — the same pattern as the resize handles here.
 *
 * ponytail: v1 knows two panels (terminal, browser) via `renderPanel`; a new
 * dockable panel just adds a case there and an entry in `PANEL_LABEL`.
 */
import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../lib/store";
import { usePreview } from "../../lib/preview";
import { useTerminals } from "../../lib/terminals";
import {
  useLayout,
  findPanel,
  type DockArea,
  type PanelId,
  type DropTarget,
  type Group,
} from "../../lib/layout";
import { TerminalPanel } from "./TerminalPanel";
import { BrowserPanel } from "./BrowserPanel";
import { BrowserInspector } from "./BrowserInspector";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";
import { MoreVerticalIcon } from "../atoms/icons";
import { type MessageKey } from "../../i18n";

const PANEL_LABEL: Record<PanelId, MessageKey> = {
  terminal: "dock.terminal",
  browser: "dock.browser",
  inspector: "dock.inspector",
};

function renderPanel(id: PanelId) {
  if (id === "terminal") return <TerminalPanel docked />;
  if (id === "browser") return <BrowserPanel docked />;
  if (id === "inspector") return <BrowserInspector docked />;
  return null;
}

/** Turn a panel off (visibility lives in each panel's own store; the layout only
 *  remembers *where* it goes when shown). Closing the detached console folds it
 *  back out of the layout and hides it. */
function closePanel(id: PanelId) {
  if (id === "terminal") useTerminals.getState().toggle();
  if (id === "browser") usePreview.getState().close();
  if (id === "inspector") {
    const p = usePreview.getState();
    p.setInspectorDetached(false);
    if (p.inspector) p.toggleInspector();
    useLayout.getState().remove("inspector");
  }
}

/** Resolve the dock target under a screen point by walking up from the element
 *  there — an empty-area rail, a group's strip (stack), or a group body (split). */
function dropTargetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const rail = el.closest<HTMLElement>("[data-dock-rail]");
  if (rail) return { area: rail.dataset.area as DockArea, groupId: null, zone: "split" };
  const cell = el.closest<HTMLElement>("[data-dock-cell]");
  if (!cell) return null;
  const area = cell.dataset.area as DockArea;
  const groupId = cell.dataset.groupId ?? null;
  const onStrip = !!el.closest<HTMLElement>("[data-dock-strip]");
  return { area, groupId, zone: onStrip ? "stack" : "split" };
}

export function DockRegion({ area }: { area: DockArea }) {
  const { t } = useTranslation();
  const layout = useLayout((s) => s.layout);
  const setAreaSize = useLayout((s) => s.setAreaSize);
  const setGroupSize = useLayout((s) => s.setGroupSize);
  const move = useLayout((s) => s.move);
  const activate = useLayout((s) => s.activate);
  const dragging = useLayout((s) => s.dragging);
  const dropTarget = useLayout((s) => s.dropTarget);
  const terminalOpen = useTerminals((s) => s.open);
  const browserOpen = usePreview((s) => s.open);
  // The console shows as a dock panel only when it's both on and detached.
  const inspectorOpen = usePreview((s) => s.inspector && s.inspectorDetached);
  const isOpen = (id: PanelId) =>
    id === "terminal" ? terminalOpen : id === "browser" ? browserOpen : id === "inspector" ? inspectorOpen : false;

  const regionRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; panel: PanelId } | null>(null);

  const horizontal = area === "bottom"; // bottom splits its groups horizontally
  const areaState = layout.areas[area];
  // Only render groups that have at least one *open* panel; keep their real ids so
  // resize/move act on the model, but hide closed tabs — and re-point `active` to a
  // still-open tab so we never render a panel that's actually closed.
  const groups = areaState.groups
    .map((g) => {
      const tabs = g.tabs.filter(isOpen);
      const active = tabs.includes(g.active) ? g.active : tabs[0];
      return { ...g, tabs, active };
    })
    .filter((g) => g.tabs.length > 0);

  // Drag a dock tab (pointer-based). Below a small threshold it's a click (activate
  // the tab); past it, it's a drag — the target under the pointer is applied on up.
  const startTabDrag = (e: React.PointerEvent, id: PanelId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { setDragging, setDropTarget } = useLayout.getState();
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        active = true;
        setDragging(id);
      }
      setDropTarget(dropTargetAt(ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!active) {
        activate(id);
        return;
      }
      const target = dropTargetAt(ev.clientX, ev.clientY);
      const from = findPanel(useLayout.getState().layout, id);
      // Apply unless it lands back on its own group (a no-op that would just churn).
      if (target && target.groupId !== from?.groupId) {
        if (target.zone === "stack" && target.groupId) {
          move(id, target.area, { targetGroupId: target.groupId });
        } else {
          move(id, target.area, { split: true });
        }
      }
      setDragging(null);
      setDropTarget(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Empty area: normally nothing, but while dragging show a rail so a lone panel
  // can be dragged here (e.g. terminal in the bottom → the empty right area).
  if (groups.length === 0) {
    if (!dragging) return null;
    const railTargeted = dropTarget?.area === area && dropTarget.groupId === null;
    return (
      <div
        data-dock-rail
        data-area={area}
        className={`grid flex-none place-items-center border-dashed text-xs transition-colors ${
          horizontal ? "h-20 border-t-2" : "w-40 border-l-2"
        } ${railTargeted ? "border-accent bg-accent/20 text-accent" : "border-line-strong/60 bg-surface text-faint"}`}
      >
        {t("dock.dropHere")}
      </div>
    );
  }

  const totalWeight = groups.reduce((s, g) => s + g.size, 0) || 1;

  // Resize the whole area (its height for bottom, width for right).
  const startAreaResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = horizontal ? e.clientY : e.clientX;
    const startSize = areaState.size;
    const z = useSettings.getState().zoom || 1;
    const onMove = (ev: PointerEvent) => {
      const cur = horizontal ? ev.clientY : ev.clientX;
      // Bottom grows upward, right grows leftward → both shrink as the pointer moves in.
      setAreaSize(area, startSize + (start - cur) / z);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Resize two adjacent groups by re-weighting them from their rendered pixel sizes.
  const startGroupResize = (e: React.PointerEvent, i: number, a: Group, b: Group) => {
    e.preventDefault();
    const cells = regionRef.current?.querySelectorAll<HTMLElement>("[data-dock-cell]");
    const elA = cells?.[i];
    const elB = cells?.[i + 1];
    if (!elA || !elB) return;
    const rectPx = (el: HTMLElement) => (horizontal ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
    const startPxA = rectPx(elA);
    const startPxB = rectPx(elB);
    const pair = a.size + b.size;
    const start = horizontal ? e.clientX : e.clientY;
    const z = useSettings.getState().zoom || 1;
    const onMove = (ev: PointerEvent) => {
      const cur = horizontal ? ev.clientX : ev.clientY;
      const delta = (cur - start) / z;
      const newA = Math.max(60, startPxA + delta);
      const newB = Math.max(60, startPxB - delta);
      const wA = (pair * newA) / (newA + newB);
      setGroupSize(area, a.id, wA);
      setGroupSize(area, b.id, pair - wA);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const menuItems = (panel: PanelId): ContextMenuItem[] => {
    const at = findPanel(layout, panel);
    const items: ContextMenuItem[] = [];
    if (at?.area !== "right") items.push({ label: t("dock.moveRight"), onSelect: () => move(panel, "right", { split: true }) });
    if (at?.area !== "bottom") items.push({ label: t("dock.moveBottom"), onSelect: () => move(panel, "bottom", { split: true }) });
    // Stack with the other open panel, if it lives in a different group.
    const other: PanelId = panel === "terminal" ? "browser" : "terminal";
    const otherAt = isOpen(other) ? findPanel(layout, other) : null;
    if (otherAt && otherAt.groupId !== at?.groupId) {
      items.push({
        label: t("dock.stackWith", { panel: t(PANEL_LABEL[other]) }),
        onSelect: () => move(panel, otherAt.area, { targetGroupId: otherAt.groupId }),
      });
    }
    items.push({ label: t("dock.close"), danger: true, separatorBefore: true, onSelect: () => closePanel(panel) });
    items.push({
      label: t("dock.reset"),
      onSelect: () => {
        // The default layout has no console panel — fold it back so it isn't left
        // "detached" with nowhere to render.
        usePreview.getState().setInspectorDetached(false);
        useLayout.getState().reset();
      },
    });
    return items;
  };

  // Is a given group the current drop target, and in which zone?
  const targetZone = (groupId: string): "stack" | "split" | null =>
    dropTarget?.area === area && dropTarget.groupId === groupId ? dropTarget.zone : null;

  return (
    <div
      ref={regionRef}
      className={`relative flex flex-none ${horizontal ? "flex-row border-t" : "flex-col border-l"} border-line`}
      style={horizontal ? { height: areaState.size } : { width: areaState.size }}
    >
      {/* Resize the whole area (straddles its inner edge toward the editor). */}
      <div
        onPointerDown={startAreaResize}
        className={`absolute z-20 ${horizontal ? "-top-1 right-0 left-0 h-2 cursor-row-resize" : "top-0 -left-1 bottom-0 w-2 cursor-col-resize"}`}
      />
      {groups.map((g, i) => {
        const zone = targetZone(g.id);
        return (
          <Fragment key={g.id}>
            <div
              data-dock-cell
              data-area={area}
              data-group-id={g.id}
              className="relative flex min-h-0 min-w-0 flex-col"
              style={{ flexGrow: g.size / totalWeight, flexBasis: 0, flexShrink: 1 }}
            >
              {/* Dock strip: tab(s) + move menu. Drag handle + stack drop target. */}
              <div
                data-dock-strip
                className={`flex h-7 flex-none items-center gap-0.5 border-b bg-surface px-1 ${
                  zone === "stack" ? "border-accent bg-accent/20" : "border-line"
                }`}
              >
                {g.tabs.map((id) => {
                  const activeTab = g.active === id || g.tabs.length === 1;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={t("dock.menu")}
                      onPointerDown={(e) => startTabDrag(e, id)}
                      className={`flex cursor-grab items-center rounded px-2 py-0.5 text-xs select-none active:cursor-grabbing ${
                        activeTab ? "bg-canvas text-ink" : "text-faint hover:text-ink"
                      }`}
                    >
                      {t(PANEL_LABEL[id])}
                    </button>
                  );
                })}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={t("dock.menu")}
                  onClick={(e) => {
                    // Stop the opening click from reaching ContextMenu's window
                    // "click" dismiss listener, which would close it immediately.
                    e.stopPropagation();
                    useLayout.getState().setMenuOpen(true);
                    setMenu({ x: e.clientX, y: e.clientY, panel: g.active });
                  }}
                  className="grid h-5 w-5 place-items-center rounded text-faint hover:bg-canvas hover:text-ink"
                >
                  <MoreVerticalIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {renderPanel(g.active)}
                {/* Split target: a thick accent frame over the body, shown only while
                    the pointer is over this group's body during a drag. */}
                {zone === "split" && (
                  <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center border-[3px] border-accent bg-accent/10 text-xs font-medium text-accent">
                    {t("dock.split")}
                  </div>
                )}
              </div>
            </div>
            {/* Splitter between adjacent groups. */}
            {i < groups.length - 1 && (
              <div
                onPointerDown={(e) => startGroupResize(e, i, g, groups[i + 1])}
                className={`z-10 flex-none bg-line hover:bg-accent ${horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"}`}
              />
            )}
          </Fragment>
        );
      })}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.panel)}
          onClose={() => {
            setMenu(null);
            useLayout.getState().setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
