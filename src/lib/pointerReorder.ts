/**
 * Pointer-based drag-to-reorder.
 *
 * Reado runs in a Tauri webview with the OS drag-drop handler enabled (so the
 * file tree can accept dropped files), which hijacks HTML5 drag-and-drop —
 * `draggable` / `onDragStart` never fire in-page. So reordering (activity-bar
 * tools, editor tabs) uses raw pointer events instead: press an item, move past a
 * small threshold to start dragging, and drop onto another item.
 *
 * Attach `onPointerDown(id)` and `data-reorder-id={id}` to each item; render the
 * drop indicator from `over`. A click that didn't cross the threshold is left
 * intact (so selecting a tab/tool still works); a real drag swallows the trailing
 * click so it doesn't also activate the item.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const THRESHOLD = 4; // px of movement before a press becomes a drag

/**
 * FLIP animation for a reorderable list: whenever `key` (the current order)
 * changes, each `[data-reorder-id]` item slides from its previous position to its
 * new one. Under reduce-motion the global CSS collapses the transition to instant.
 */
export function useFlip(ref: { current: HTMLElement | null }, key: string): void {
  const prev = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-id]"));
    const now = new Map<string, DOMRect>();
    for (const el of items) now.set(el.dataset.reorderId ?? "", el.getBoundingClientRect());
    for (const el of items) {
      const id = el.dataset.reorderId ?? "";
      const old = prev.current.get(id);
      const cur = now.get(id);
      if (!old || !cur) continue;
      const dx = old.left - cur.left;
      const dy = old.top - cur.top;
      if (!dx && !dy) continue;
      // Jump back to the old spot with no transition, then release to slide in.
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 200ms var(--ease, ease)";
        el.style.transform = "";
        // Clear the inline styles once settled so the element's own CSS
        // (e.g. `transition-colors`) isn't left overridden.
        const cleanup = () => {
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", cleanup);
        };
        el.addEventListener("transitionend", cleanup);
      });
    }
    prev.current = now;
  }, [key, ref]);
}

export interface ReorderState {
  /** Id of the item currently being dragged, or null. */
  dragging: string | null;
  /** The current drop target and side, or null. */
  over: { id: string; after: boolean } | null;
  onPointerDown: (id: string) => (e: React.PointerEvent) => void;
}

export function usePointerReorder(
  axis: "x" | "y",
  onCommit: (from: string, to: string, after: boolean) => void,
): ReorderState {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const start = useRef<{ id: string; x: number; y: number } | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-id]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const after = axis === "x" ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
      return { id: el.dataset.reorderId ?? "", after };
    };

    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!dragging) {
        if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < THRESHOLD) return;
        setDragging(s.id);
      }
      const tgt = targetAt(e.clientX, e.clientY);
      setOver(tgt && tgt.id && tgt.id !== s.id ? tgt : null);
    };

    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      const wasDragging = dragging;
      setDragging(null);
      setOver(null);
      if (!s || !wasDragging) return;
      // A real drag happened → swallow the trailing click so it doesn't also
      // activate the item under the pointer.
      const stopClick = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener("click", stopClick, true);
      };
      window.addEventListener("click", stopClick, true);
      const tgt = targetAt(e.clientX, e.clientY);
      if (tgt && tgt.id && tgt.id !== s.id) commit.current(s.id, tgt.id, tgt.after);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, axis]);

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    start.current = { id, x: e.clientX, y: e.clientY };
  };

  return { dragging, over, onPointerDown };
}
