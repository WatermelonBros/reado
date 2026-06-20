/**
 * Right-side drawer built on Ark UI's headless `Dialog`.
 *
 * Used for surfaces that benefit from staying anchored to the edge rather than
 * floating in a centred modal (e.g. Settings). Ark handles focus trap, Escape
 * and dismissal; the slide animation lives in app.css (`.drawer-content`).
 */
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel?: string;
  /** Extra classes for the panel surface (e.g. width). */
  className?: string;
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, ariaLabel, className = "", children }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} unmountOnExit lazyMount>
      <Portal>
        <Dialog.Backdrop className="drawer-backdrop fixed inset-0 z-[110] bg-[color-mix(in_oklch,var(--bg)_45%,transparent)]" />
        <Dialog.Positioner className="fixed inset-y-0 right-0 z-[110] flex">
          <Dialog.Content
            aria-label={ariaLabel}
            className={`drawer-content flex h-full flex-col border-l border-line-strong bg-canvas shadow-[var(--shadow)] focus:outline-none ${className}`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
