/**
 * Right-side drawer built on Rind's headless `Dialog`.
 *
 * Used for surfaces that benefit from staying anchored to the edge rather than
 * floating in a centred modal (e.g. Settings). Rind handles focus trap, Escape
 * and dismissal; the slide animation lives in app.css (`.drawer-content`).
 */
import { Dialog } from "@rind-ui/react"

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ariaLabel?: string
  /** Extra classes for the panel surface (e.g. width). */
  className?: string
  children: React.ReactNode
}

export function Drawer({ open, onOpenChange, ariaLabel, className = "", children }: DrawerProps) {
  // The native preview webview paints over all DOM — tell it to hide while we are up.

  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="drawer-backdrop reado-scrim fixed inset-0 z-[110]" />
        <Dialog.Positioner className="fixed inset-y-0 right-0 z-[110] flex">
          <Dialog.Content
            aria-label={ariaLabel}
            className={`drawer-content flex h-full flex-col border-l border-line-strong bg-canvas shadow-[var(--shadow)] focus:outline-none ${className}`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
