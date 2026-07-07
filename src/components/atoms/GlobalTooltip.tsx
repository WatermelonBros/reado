/**
 * One styled tooltip for the whole app.
 *
 * WKWebView (Tauri on macOS) doesn't render native `title` tooltips, so buttons
 * that set `title=…` show nothing on hover. This surfaces them ourselves: hover
 * any element carrying a `title` and, after a short delay, a small themed bubble
 * appears near it. It reuses the `title` attributes already on the app's icon
 * buttons — no per-button wiring. The native attribute is stashed while shown so
 * a platform that *does* honour it can't double up.
 *
 * Mounted once at the app root (outside the zoom transform layer) so its
 * `position: fixed` coordinates map to the viewport.
 */
import { useEffect, useRef, useState } from "react";

type Tip = { x: number; y: number; text: string; above: boolean };

export function GlobalTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<{ el: HTMLElement | null; title: string | null; timer: number }>({
    el: null,
    title: null,
    timer: 0,
  });

  useEffect(() => {
    const clear = () => {
      window.clearTimeout(ref.current.timer);
      // Restore the stashed native title on the element we hid it on.
      if (ref.current.el && ref.current.title != null) {
        ref.current.el.setAttribute("title", ref.current.title);
      }
      ref.current.el = null;
      ref.current.title = null;
      setTip(null);
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[title]");
      if (!el || el === ref.current.el) return;
      clear(); // switching targets — reset any pending/shown tip first
      const text = el.getAttribute("title")?.trim();
      if (!text) return;
      ref.current.el = el;
      ref.current.title = el.getAttribute("title");
      el.removeAttribute("title"); // suppress any native tooltip
      ref.current.timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const x = Math.min(Math.max(r.left + r.width / 2, 60), window.innerWidth - 60);
        const above = window.innerHeight - r.bottom < 44;
        setTip({ x, y: above ? r.top - 6 : r.bottom + 6, text, above });
      }, 350);
    };

    const onOut = (e: MouseEvent) => {
      if (!ref.current.el) return;
      const to = e.relatedTarget as Node | null;
      if (to && ref.current.el.contains(to)) return; // moved to a child — keep
      clear();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", clear, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousedown", clear, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-[200] -translate-x-1/2 rounded-md border border-line bg-overlay px-2 py-1 text-xs leading-snug text-ink shadow-[var(--shadow)] ${
        tip.above ? "-translate-y-full" : ""
      }`}
      style={{ left: tip.x, top: tip.y, maxWidth: "min(320px, 90vw)" }}
    >
      {tip.text}
    </div>
  );
}
