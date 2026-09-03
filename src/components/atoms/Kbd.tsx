/**
 * A key cap — the shared version of the bordered chip the palette, the
 * shortcuts dialog and the welcome screen each drew their own way. One
 * component, so a combo looks the same wherever it is named.
 */
import { cn } from "@/lib/cn"

export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "flex-none rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  )
}
