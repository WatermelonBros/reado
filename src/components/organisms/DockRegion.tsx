/**
 * A dock area (`right` or `bottom`) rendered from the layout model. It lays out
 * the *open* panels placed in the area as resizable groups — side-by-side in the
 * bottom, stacked vertically on the right — each group a tabbed stack. A slim
 * dock strip per group carries the panel name(s), a move menu, close, and the
 * drag handle; dropping a dragged tab onto a strip stacks it, onto a body splits
 * a new group beside it. This is what lets the browser sit beside the terminal.
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
  type Group,
} from "../../lib/layout";
import { TerminalPanel } from "./TerminalPanel";
import { BrowserPanel } from "./BrowserPanel";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";
import { MoreVerticalIcon } from "../atoms/icons";
import { type MessageKey } from "../../i18n";

const PANEL_LABEL: Record<PanelId, MessageKey> = { terminal: "dock.terminal", browser: "dock.browser" };

function renderPanel(id: PanelId) {
  if (id === "terminal") return <TerminalPanel docked />;
  if (id === "browser") return <BrowserPanel docked />;
  return null;
}

/** Turn a panel off (visibility lives in each panel's own store; the layout only
 *  remembers *where* it goes when shown). */
function closePanel(id: PanelId) {
  if (id === "terminal") useTerminals.getState().toggle();
  if (id === "browser") usePreview.getState().close();
}

export function DockRegion({ area }: { area: DockArea }) {
  const { t } = useTranslation();
  const layout = useLayout((s) => s.layout);
  const setAreaSize = useLayout((s) => s.setAreaSize);
  const setGroupSize = useLayout((s) => s.setGroupSize);
  const move = useLayout((s) => s.move);
  const activate = useLayout((s) => s.activate);
  const dragging = useLayout((s) => s.dragging);
  const setDragging = useLayout((s) => s.setDragging);
  const terminalOpen = useTerminals((s) => s.open);
  const browserOpen = usePreview((s) => s.open);
  const isOpen = (id: PanelId) => (id === "terminal" ? terminalOpen : id === "browser" ? browserOpen : false);

  const regionRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; panel: PanelId } | null>(null);

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
  if (groups.length === 0) return null;

  const horizontal = area === "bottom"; // bottom splits its groups horizontally
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
    const other: PanelId | null = panel === "terminal" ? "browser" : "terminal";
    const otherAt = other && isOpen(other) ? findPanel(layout, other) : null;
    if (other && otherAt && otherAt.groupId !== at?.groupId) {
      items.push({
        label: t("dock.stackWith", { panel: t(PANEL_LABEL[other]) }),
        onSelect: () => move(panel, otherAt.area, { targetGroupId: otherAt.groupId }),
      });
    }
    items.push({ label: t("dock.close"), danger: true, separatorBefore: true, onSelect: () => closePanel(panel) });
    items.push({ label: t("dock.reset"), onSelect: () => useLayout.getState().reset() });
    return items;
  };

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
      {groups.map((g, i) => (
        <Fragment key={g.id}>
          <div
            data-dock-cell
            className="relative flex min-h-0 min-w-0 flex-col"
            style={{ flexGrow: g.size / totalWeight, flexBasis: 0, flexShrink: 1 }}
            onDragOver={(e) => {
              if (dragging) e.preventDefault();
            }}
            onDrop={(e) => {
              // Drop on a group body → split a new group beside it.
              if (!dragging) return;
              e.preventDefault();
              move(dragging, area, { split: true });
              setDragging(null);
            }}
          >
            {/* Dock strip: tab(s) + move menu + close. Drop target for stacking. */}
            <div
              className="flex h-7 flex-none items-center gap-0.5 border-b border-line bg-surface px-1"
              onDragOver={(e) => {
                if (dragging) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragging, area, { targetGroupId: g.id });
                setDragging(null);
              }}
            >
              {g.tabs.map((id) => {
                const activeTab = g.active === id || g.tabs.length === 1;
                return (
                  <button
                    key={id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      // WKWebView (Tauri/macOS) won't start a drag without payload.
                      e.dataTransfer.setData("text/plain", id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => activate(id)}
                    className={`flex cursor-grab items-center rounded px-2 py-0.5 text-xs active:cursor-grabbing ${
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
                  useLayout.getState().setMenuOpen(true);
                  setMenu({ x: e.clientX, y: e.clientY, panel: g.active });
                }}
                className="grid h-5 w-5 place-items-center rounded text-faint hover:bg-canvas hover:text-ink"
              >
                <MoreVerticalIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderPanel(g.active)}</div>
          </div>
          {/* Splitter between adjacent groups. */}
          {i < groups.length - 1 && (
            <div
              onPointerDown={(e) => startGroupResize(e, i, g, groups[i + 1])}
              className={`z-10 flex-none bg-line hover:bg-accent ${horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize"}`}
            />
          )}
        </Fragment>
      ))}
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
