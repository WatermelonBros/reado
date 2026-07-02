/**
 * One shared right-click menu, so every context menu in Reado (file tree, tabs,
 * editor) looks and behaves identically: same surface, same dismissal (outside
 * click / Escape / scroll / blur), kept inside the viewport.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  /** Destructive action — rendered in the marker colour. */
  danger?: boolean;
  disabled?: boolean;
  /** Show a check on the right (for toggle-style items). */
  checked?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Keep the menu within the viewport (flip near the right/bottom edges).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  // Move focus into the menu on open so it's operable from the keyboard.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])',
    );
    first?.focus();
  }, []);

  // Roving focus between items: Up/Down cycle, Home/End jump. (Escape/activate
  // are handled below and by the buttons themselves.)
  const onKeyDown = (e: React.KeyboardEvent) => {
    const btns = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (btns.length === 0) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      btns[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      btns[btns.length - 1]?.focus();
    }
  };

  // Dismiss on any outside interaction.
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <ul
      ref={ref}
      role="menu"
      className="fixed z-[120] min-w-[200px] overflow-hidden rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => (
        <li key={item.label} role="none">
          {item.separatorBefore && i > 0 && <div className="my-1 border-t border-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
              item.danger
                ? "text-marker hover:bg-surface"
                : "text-ink hover:bg-surface"
            }`}
          >
            {item.icon && <span className="flex-none text-muted">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
            {item.checked && <span className="flex-none text-accent">✓</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
