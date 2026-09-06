/**
 * A collapsible section of the extensions panel.
 *
 * The panel stacks several catalogues in one narrow column, and the ones you
 * aren't looking at are pure scroll cost. Each section remembers whether you
 * left it open, so the shape you arrange once is the shape you get back.
 *
 * Built on Ark's Collapsible: it owns the disclosure semantics and the
 * height animation, and the header stays a real button for the keyboard.
 */
import { Collapsible } from "@ark-ui/react/collapsible"
import type { ReactNode } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { ChevronIcon } from "@/components/atoms/icons"

interface OpenState {
  /** Section id → open. Absent means "use the section's own default". */
  open: Record<string, boolean>
  toggle: (id: string, open: boolean) => void
}

export const useSectionState = create<OpenState>()(
  persist(
    (set) => ({
      open: {},
      toggle: (id, open) => set((s) => ({ open: { ...s.open, [id]: open } })),
    }),
    { name: "reado.extensionSections" },
  ),
)

export function Section({
  id,
  title,
  count,
  forceOpen,
  action,
  children,
}: {
  /** Stable key for the remembered open/closed state. */
  id: string
  title: string
  count?: number
  /** Open regardless of what the user left it at. Searching is a "show me"
   *  gesture: honouring a fold would hide the very thing you asked for. */
  forceOpen?: boolean
  /** One control on the header row (a refresh button, say). */
  action?: ReactNode
  children: ReactNode
}) {
  const remembered = useSectionState((s) => s.open[id])
  const toggle = useSectionState((s) => s.toggle)
  const open = forceOpen || (remembered ?? true)

  return (
    <Collapsible.Root open={open} onOpenChange={(e) => toggle(id, e.open)}>
      <div className="sticky top-0 z-10 flex h-7 items-center gap-1 border-b border-line bg-canvas pr-3 pl-1">
        <Collapsible.Trigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left">
          <ChevronIcon
            className={`h-3 w-3 flex-none text-faint transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          />
          <span className="truncate text-xs font-medium tracking-wide text-faint uppercase">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="text-xs tabular-nums text-faint/70">{count}</span>
          )}
        </Collapsible.Trigger>
        {action}
      </div>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
