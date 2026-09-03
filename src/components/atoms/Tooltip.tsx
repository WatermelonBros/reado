/**
 * Themed tooltip built on Ark UI's headless `Tooltip`.
 *
 * The Ark-idiomatic, per-trigger replacement for the global `title`-scraping
 * `GlobalTooltip`: components (e.g. `IconButton`) wrap their trigger in this and
 * the label surfaces on hover/focus. Ark handles the delay, dismissal, ARIA and
 * floating-ui positioning — which reads the trigger's real rect, so it lands
 * correctly even under the interface-zoom transform. Rendered through a portal so
 * its positioner escapes that transform layer.
 *
 * A missing/empty `label` renders the child alone (no tooltip machinery), so it's
 * safe to wrap unconditionally.
 */

import { Portal } from "@ark-ui/react/portal"
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip"
import type { ReactElement } from "react"

interface Props {
  /** Tooltip text; when falsy the child renders bare. */
  label?: string
  /** The single trigger element (receives Ark's trigger props via `asChild`). */
  children: ReactElement
  /** Preferred side; Ark flips it near a viewport edge. */
  placement?: "top" | "bottom" | "left" | "right"
}

export function Tooltip({ label, children, placement = "bottom" }: Props) {
  if (!label) return children
  return (
    // `lazyMount` + `unmountOnExit`: without them Ark's presence predicate is
    // never true, so every tooltip renders its positioner and content into a
    // body-level portal whether or not it has ever opened. With an IconButton
    // per row, a 40-file Source Control list carried ~120 hidden divs and their
    // state machines for tooltips nobody had hovered.
    <ArkTooltip.Root
      lazyMount
      unmountOnExit
      openDelay={350}
      closeDelay={0}
      positioning={{ placement }}
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className="animate-fade z-[200] max-w-[min(320px,90vw)] rounded-md border border-line bg-overlay px-2 py-1 text-xs leading-snug text-ink shadow-[var(--shadow)]">
            {label}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  )
}
