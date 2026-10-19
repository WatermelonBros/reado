/**
 * Themed tooltip built on rind-ui's headless `Tooltip`.
 *
 * The per-trigger replacement for the global `title`-scraping `GlobalTooltip`:
 * components (e.g. `IconButton`) wrap their trigger in this and the label
 * surfaces on hover/focus. Rind handles the delay, dismissal, ARIA and
 * positioning — which reads the trigger's real rect, so it lands correctly even
 * under the interface-zoom transform. Rendered through a portal (a host `div` on
 * `<body>`) so its positioner escapes that transform layer.
 *
 * A missing/empty `label` renders the child alone (no tooltip machinery), so it's
 * safe to wrap unconditionally.
 */

import { Tooltip as RindTooltip } from "@rind-ui/react"
import { type ReactElement, useState } from "react"

interface Props {
  /** Tooltip text; when falsy the child renders bare. */
  label?: string
  /** The single trigger element (receives rind's trigger props via `render`). */
  children: ReactElement
  /** Preferred side; rind flips it near a viewport edge. */
  placement?: "top" | "bottom" | "left" | "right"
}

export function Tooltip({ label, children, placement = "bottom" }: Props) {
  // Rind keeps the content mounted (hidden) while closed; the portal is rendered
  // only while open instead. With an IconButton per row, a 40-file Source Control
  // list would otherwise carry ~120 hidden body-level divs for tooltips nobody
  // had hovered. Rind's positioning waits for the positioner to mount.
  const [open, setOpen] = useState(false)
  if (!label) return children
  return (
    <RindTooltip.Root
      openDelay={350}
      closeDelay={0}
      positioning={{ side: placement }}
      onOpenChange={setOpen}
    >
      <RindTooltip.Trigger render={children} />
      {open && (
        <RindTooltip.Portal>
          {/* z-index on the positioner: it is the positioned box, so the
              content's own z-index can't lift it. */}
          <RindTooltip.Positioner className="z-[200]">
            <RindTooltip.Content className="animate-fade z-[200] max-w-[min(320px,90vw)] rounded-md border border-line bg-overlay px-2 py-1 text-xs leading-snug text-ink shadow-[var(--shadow)]">
              {label}
            </RindTooltip.Content>
          </RindTooltip.Positioner>
        </RindTooltip.Portal>
      )}
    </RindTooltip.Root>
  )
}
