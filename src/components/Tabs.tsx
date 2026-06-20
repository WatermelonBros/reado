/** Open-file tab strip, with a right-click context menu per tab. */
import { useState } from "react";
import { useProject } from "../lib/store";
import { formatDocument } from "../lib/docInfo";
import { useT } from "../i18n";
import { CloseIcon } from "./icons";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function Tabs() {
  const tabs = useProject((s) => s.tabs);
  const active = useProject((s) => s.active);
  const setActive = useProject((s) => s.setActive);
  const close = useProject((s) => s.close);
  const closeOthers = useProject((s) => s.closeOthers);
  const closeToRight = useProject((s) => s.closeToRight);
  const closeAll = useProject((s) => s.closeAll);
  const t = useT();

  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  if (tabs.length === 0) return null;

  const path = menu?.path ?? "";
  const isLast = menu ? tabs.indexOf(menu.path) === tabs.length - 1 : true;
  const items: ContextMenuItem[] = [
    { label: t("tabs.close"), onSelect: () => close(path) },
    { label: t("tabs.closeOthers"), onSelect: () => closeOthers(path), disabled: tabs.length < 2 },
    { label: t("tabs.closeRight"), onSelect: () => closeToRight(path), disabled: isLast },
    { label: t("tabs.closeAll"), onSelect: closeAll },
    {
      label: t("editor.format"),
      separatorBefore: true,
      onSelect: () => {
        setActive(path);
        setTimeout(() => void formatDocument(), 80);
      },
    },
  ];

  return (
    <div
      role="tablist"
      className="flex h-[38px] flex-none items-stretch overflow-x-auto border-b border-line bg-surface [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tabPath) => {
        const isActive = active === tabPath;
        return (
          <div
            key={tabPath}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActive(tabPath)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, path: tabPath });
            }}
            // Middle-click (mouse wheel) closes the tab, like a browser.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                close(tabPath);
              }
            }}
            title={tabPath}
            className={`group flex max-w-[220px] cursor-pointer items-center gap-2 whitespace-nowrap border-r border-line pl-4 pr-2 text-sm transition-colors ${
              isActive
                ? "bg-canvas text-ink shadow-[inset_0_2px_0_var(--accent)]"
                : "text-muted hover:bg-canvas/50 hover:text-ink"
            }`}
          >
            <span className="overflow-hidden text-ellipsis">{basename(tabPath)}</span>
            <button
              type="button"
              aria-label={`Close ${basename(tabPath)}`}
              onClick={(e) => {
                e.stopPropagation();
                close(tabPath);
              }}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-sm leading-none text-faint transition-opacity hover:bg-overlay hover:text-ink ${
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <CloseIcon className="block h-[13px] w-[13px]" />
            </button>
          </div>
        );
      })}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
