/**
 * One shared right-click menu, so every context menu in Reado (file tree, tabs,
 * editor) looks and behaves identically: same surface, same dismissal (outside
 * click / Escape / scroll / blur), kept inside the viewport.
 *
 * Rendered through a portal to `document.body` so it escapes the interface-zoom
 * layer. That layer applies `transform: scale(var(--app-zoom))`, and *any*
 * transform (even `scale(1)`) makes the element a containing block for `fixed`
 * descendants — so a menu rendered inside it is positioned relative to that box
 * (offset by the title bar, and scaled at zoom ≠ 1) instead of the viewport, i.e.
 * not where the pointer clicked. At the body level, `fixed` is viewport-relative
 * again and `clientX/clientY` land exactly under the cursor.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CheckIcon } from "./icons"

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  icon?: React.ReactNode
  /** Destructive action — rendered in the marker colour. */
  danger?: boolean
  disabled?: boolean
  /** Show a check on the right (for toggle-style items). */
  checked?: boolean
  /** Draw a divider above this item. */
  separatorBefore?: boolean
  /** Keep the menu open after selecting (an item that swaps the menu's own
   *  contents, e.g. "Open With ▸"). */
  keepOpen?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/** Gap kept between the menu and the window edge. */
const MARGIN = 8

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Keep the menu within the viewport: pulled back from the right/bottom edges,
  // and never past the top/left ones — a menu taller than the window used to be
  // pushed up until its first rows were off-screen. Its height is capped at the
  // window (below), so there is always room once it's clamped.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    })
  }, [x, y])

  // Move focus into the menu on open so it's operable from the keyboard.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])',
    )
    first?.focus()
  }, [])

  // Roving focus between items: Up/Down cycle, Home/End jump. (Escape/activate
  // are handled below and by the buttons themselves.)
  const onKeyDown = (e: React.KeyboardEvent) => {
    const btns = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ??
        [],
    )
    if (btns.length === 0) return
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      btns[(i + 1) % btns.length]?.focus()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      btns[(i - 1 + btns.length) % btns.length]?.focus()
    } else if (e.key === "Home") {
      e.preventDefault()
      btns[0]?.focus()
    } else if (e.key === "End") {
      e.preventDefault()
      btns[btns.length - 1]?.focus()
    }
  }

  // Dismiss on any outside interaction.
  //
  // The click listener has to test containment rather than trust
  // `stopPropagation` on the item's React handler: the menu is portalled to
  // `document.body`, outside React's root container, so a synthetic
  // stopPropagation never reaches this native listener and every in-menu click
  // used to close the menu whether the item wanted it or not.
  useEffect(() => {
    const close = (e?: Event) => {
      // Neither a click on an item nor scrolling the menu's own list (a long
      // one scrolls) is an outside interaction.
      if ((e?.type === "click" || e?.type === "scroll") && ref.current?.contains(e.target as Node))
        return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    // The click listener waits a frame. React flushes the state update that
    // *opened* the menu while the opening click is still on its way to the
    // window, so a menu opened by a left click (the terminal's profile picker)
    // would receive that very click and close before it was ever seen. A menu
    // opened by a right click never had the problem — `contextmenu` is not
    // followed by a `click` — which is why this only showed up under a real
    // mouse.
    const armed = requestAnimationFrame(() => window.addEventListener("click", close))
    window.addEventListener("resize", close)
    window.addEventListener("blur", close)
    document.addEventListener("scroll", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(armed)
      window.removeEventListener("click", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("blur", close)
      document.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] max-h-[calc(100vh-16px)] min-w-[200px] overflow-y-auto rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => (
        <div key={item.label} role="none">
          {item.separatorBefore && i > 0 && <div className="my-1 border-t border-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (!item.keepOpen) onClose()
              item.onSelect()
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
              item.danger ? "text-marker hover:bg-surface" : "text-ink hover:bg-surface"
            }`}
          >
            {item.icon && <span className="flex-none text-muted">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
            {item.checked && <CheckIcon className="h-3 w-3 flex-none text-accent" />}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
