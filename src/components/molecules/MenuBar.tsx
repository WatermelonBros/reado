/**
 * Rendered app menu bar for the Windows/Linux title bar.
 *
 * `decorations: false` removes the native menu strip on those platforms, so we
 * draw File / Edit / View / … here. It reuses `runMenuCommand` (the same handler
 * the native macOS menu dispatches through) and the `APP_MENUS` model, so there's
 * one source of truth. macOS keeps its system menu bar and never renders this.
 */
import { useEffect, useRef, useState } from "react";
import { APP_MENUS } from "../../lib/appMenu";
import { runMenuCommand } from "../../lib/menu";

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (id: string) => {
    setOpen(null);
    runMenuCommand(id);
  };

  return (
    <div ref={ref} className="flex h-full items-stretch">
      {APP_MENUS.map((menu, i) => (
        <div key={menu.label} className="relative flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen((o) => (o === i ? null : i))}
            // Menu-bar behaviour: once one menu is open, hovering another opens it.
            onMouseEnter={() => open !== null && setOpen(i)}
            className={`px-2.5 text-xs transition-colors ${
              open === i ? "bg-surface text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {menu.label}
          </button>
          {open === i && (
            <div className="absolute top-full left-0 z-50 min-w-[224px] rounded-md border border-line bg-overlay py-1 shadow-[var(--shadow)]">
              {menu.items.map((it, j) =>
                "sep" in it ? (
                  <div key={j} className="my-1 h-px bg-line" />
                ) : "header" in it ? (
                  <div
                    key={j}
                    className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-faint uppercase"
                  >
                    {it.header}
                  </div>
                ) : (
                  <button
                    key={j}
                    type="button"
                    onClick={() => run(it.id)}
                    className="block w-full px-3 py-1 text-left text-xs text-ink transition-colors hover:bg-surface"
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
