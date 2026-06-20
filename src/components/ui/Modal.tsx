/**
 * Themed modal dialog built on Ark UI's headless `Dialog`.
 *
 * Ark handles the hard parts (focus trap, scroll lock, Escape, outside-click
 * dismissal, ARIA); we style the backdrop and content surface. Children render
 * the dialog body; pass `ariaLabel` or include a `Dialog.Title` inside.
 */
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel?: string;
  /** Extra classes for the content surface. */
  className?: string;
  children: React.ReactNode;
}

export function Modal({ open, onOpenChange, ariaLabel, className = "", children }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="animate-fade fixed inset-0 z-[110] bg-[color-mix(in_oklch,var(--bg)_55%,transparent)] backdrop-blur-[2px]" />
        <Dialog.Positioner className="fixed inset-0 z-[110] grid place-items-center p-4">
          <Dialog.Content
            aria-label={ariaLabel}
            className={`animate-rise rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)] focus:outline-none ${className}`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
