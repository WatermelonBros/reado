/** Open-file tab strip, with a right-click context menu per tab. */
import { useEffect, useState } from "react";
import { useProject } from "../lib/store";
import { formatDocument } from "../lib/docInfo";
import { useT, type MessageKey } from "../i18n";
import { CloseIcon } from "./icons";

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

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", off);
    window.addEventListener("resize", off);
    window.addEventListener("blur", off);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", off);
      window.removeEventListener("resize", off);
      window.removeEventListener("blur", off);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (tabs.length === 0) return null;

  const path = menu?.path ?? "";
  const isLast = menu ? tabs.indexOf(menu.path) === tabs.length - 1 : true;
  const items: { label: MessageKey; run: () => void; disabled?: boolean }[] = [
    { label: "tabs.close", run: () => close(path) },
    { label: "tabs.closeOthers", run: () => closeOthers(path), disabled: tabs.length < 2 },
    { label: "tabs.closeRight", run: () => closeToRight(path), disabled: isLast },
    { label: "tabs.closeAll", run: closeAll },
    {
      label: "editor.format",
      run: () => {
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
        <ul
          className="fixed z-[120] min-w-[190px] overflow-hidden rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <li key={item.label}>
              {i === items.length - 1 && <div className="my-1 border-t border-line" />}
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setMenu(null);
                  item.run();
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-ink transition-colors hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {t(item.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
