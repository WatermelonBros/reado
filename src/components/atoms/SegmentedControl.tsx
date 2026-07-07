/**
 * Segmented control: a row (or column) of options with a single "thumb" that
 * slides to the active segment instead of the highlight jumping instantly.
 *
 * The thumb is measured from the live DOM (offset/size of the active button),
 * so segments may be equal-width (`flex-1`) or content-sized, horizontal or
 * vertical — the thumb always lands exactly on the active one and animates
 * there. A ResizeObserver keeps it aligned when labels or layout change.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Segment<T extends string> = { id: T; label: ReactNode; title?: string };

export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  orientation = "horizontal",
  ariaLabel,
  className = "",
  segmentClassName = "",
  thumbClassName = "bg-canvas rounded-md",
}: {
  value: T;
  onChange: (id: T) => void;
  segments: Segment<T>[];
  orientation?: "horizontal" | "vertical";
  ariaLabel?: string;
  /** Container styles (padding, background, gap). */
  className?: string;
  /** Per-segment button styles (size, radius, typography). */
  segmentClassName?: string;
  /** The sliding thumb's background/radius/shadow. */
  thumbClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // A stable dependency: the segment id list, not the array's identity (callers
  // pass a fresh array each render). Depending on the array would re-run the
  // effect every render and, with a new thumb object each time, loop forever.
  const sig = segments.map((s) => s.id).join("|");

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLElement>(`[data-seg="${CSS.escape(value)}"]`);
      if (!el) return;
      const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      setThumb((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
          ? prev
          : next,
      );
    };
    measure();
    // Labels/layout can change width (locale switch, resize) — keep the thumb put.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [value, sig]);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={`relative flex ${orientation === "vertical" ? "flex-col" : ""} ${className}`}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 transition-[transform,width,height] duration-200 ease-out ${thumbClassName}`}
          style={{
            transform: `translate(${thumb.x}px, ${thumb.y}px)`,
            width: thumb.w,
            height: thumb.h,
          }}
        />
      )}
      {segments.map((s) => (
        <button
          key={s.id}
          type="button"
          data-seg={s.id}
          role="tab"
          aria-selected={value === s.id}
          title={s.title}
          onClick={() => onChange(s.id)}
          className={`relative z-10 transition-colors ${segmentClassName} ${
            value === s.id ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
