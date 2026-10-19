/**
 * Segmented control: a row (or column) of options with a single "thumb" that
 * slides to the active segment instead of the highlight jumping instantly.
 *
 * Built on rind's headless `SegmentedControl` (radio semantics + keyboard nav +
 * the measured indicator). We keep the same external API as before, so call
 * sites are unchanged; we only style the surface. Rind writes the checked
 * segment's box into `--rind-indicator-*`; the thumb reads them and transitions.
 */

import { SegmentedControl as RindSegmentedControl } from "@rind-ui/react"
import type { ReactNode } from "react"

export type Segment<T extends string> = { id: T; label: ReactNode; title?: string }

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
  value: T
  onChange: (id: T) => void
  segments: Segment<T>[]
  orientation?: "horizontal" | "vertical"
  ariaLabel?: string
  /** Container styles (padding, background, gap). */
  className?: string
  /** Per-segment button styles (size, radius, typography). */
  segmentClassName?: string
  /** The sliding thumb's background/radius/shadow. */
  thumbClassName?: string
}) {
  return (
    <RindSegmentedControl.Root
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      orientation={orientation}
      aria-label={ariaLabel}
      className={`relative flex ${orientation === "vertical" ? "flex-col" : ""} ${className}`}
    >
      {/* Positioned from the checked item's measured box; no transition while
          rind flags a resize, and reduce-motion collapses it. */}
      <RindSegmentedControl.Indicator
        className={`pointer-events-none absolute top-0 left-0 h-[var(--rind-indicator-height,0)] w-[var(--rind-indicator-width,0)] translate-x-[var(--rind-indicator-left,0)] translate-y-[var(--rind-indicator-top,0)] transition-[translate,width,height] duration-200 ease-out data-[resizing]:transition-none ${thumbClassName}`}
      />
      {segments.map((s) => (
        <RindSegmentedControl.Item
          key={s.id}
          value={s.id}
          title={s.title}
          className={`relative z-10 cursor-pointer select-none transition-colors text-muted hover:text-ink data-[state=checked]:text-ink ${segmentClassName}`}
        >
          {s.label}
        </RindSegmentedControl.Item>
      ))}
    </RindSegmentedControl.Root>
  )
}
