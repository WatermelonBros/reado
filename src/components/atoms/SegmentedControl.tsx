/**
 * Segmented control: a row (or column) of options with a single "thumb" that
 * slides to the active segment instead of the highlight jumping instantly.
 *
 * Built on Ark UI's headless `SegmentGroup` (radio semantics + keyboard nav +
 * the auto-measured, animated indicator). We keep the same external API as
 * before, so call sites are unchanged; we only style the surface. Ark writes the
 * indicator's `top/left/width/height` from the checked item's rect and reads the
 * transition timing from our CSS to animate the slide.
 */
import { type ReactNode } from "react";
import { SegmentGroup } from "@ark-ui/react/segment-group";

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
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={(d) => d.value && onChange(d.value as T)}
      orientation={orientation}
      aria-label={ariaLabel}
      className={`relative flex ${orientation === "vertical" ? "flex-col" : ""} ${className}`}
    >
      {/* Ark positions this from the checked item's rect; the duration is read
          from these classes to animate the slide (reduce-motion collapses it). */}
      <SegmentGroup.Indicator
        className={`pointer-events-none absolute transition-[left,top,width,height] duration-200 ease-out ${thumbClassName}`}
      />
      {segments.map((s) => (
        <SegmentGroup.Item
          key={s.id}
          value={s.id}
          title={s.title}
          className={`relative z-10 cursor-pointer select-none transition-colors text-muted hover:text-ink data-[state=checked]:text-ink ${segmentClassName}`}
        >
          <SegmentGroup.ItemText>{s.label}</SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}
