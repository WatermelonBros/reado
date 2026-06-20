/** Open-file tab strip. */
import { useProject } from "../lib/store";
import { CloseIcon } from "./icons";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function Tabs() {
  const tabs = useProject((s) => s.tabs);
  const active = useProject((s) => s.active);
  const setActive = useProject((s) => s.setActive);
  const close = useProject((s) => s.close);

  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      className="flex h-[38px] flex-none items-stretch overflow-x-auto border-b border-line [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((path) => {
        const isActive = active === path;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActive(path)}
            // Middle-click (mouse wheel) closes the tab, like a browser.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                close(path);
              }
            }}
            title={path}
            className={`group flex max-w-[220px] cursor-pointer items-center gap-2 whitespace-nowrap border-r border-line pl-4 pr-2 text-sm transition-colors ${
              isActive
                ? "bg-canvas text-ink shadow-[inset_0_-2px_0_var(--accent)]"
                : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <span className="overflow-hidden text-ellipsis">{basename(path)}</span>
            <button
              type="button"
              aria-label={`Close ${basename(path)}`}
              onClick={(e) => {
                e.stopPropagation();
                close(path);
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
    </div>
  );
}
