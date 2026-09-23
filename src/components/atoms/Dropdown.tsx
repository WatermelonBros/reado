/**
 * A menu hung off a control: the status bar's indent / endings / encoding /
 * language / branch pickers, and the breadcrumb's folder and symbol lists.
 *
 * Ark's menu, not a hand-rolled panel — it brings the arrow-key roving focus,
 * typeahead, `aria-haspopup`/`aria-expanded`, focus return to the trigger on
 * close, and collision-aware placement that the previous version had none of.
 * Portalled, so a menu opened from the status bar is not clipped by it.
 *
 * Not `ContextMenu`: that one is positioned by pointer coordinates, which is
 * right for a right-click and wrong for a dropdown that has to stay attached to
 * the control that opened it.
 */
import { Menu } from "@ark-ui/react/menu"
import { Portal } from "@ark-ui/react/portal"
import type { ReactNode } from "react"
import { CheckIcon } from "./icons"

interface DropdownProps {
  /** What the trigger shows. */
  trigger: ReactNode
  /**
   * The trigger's tooltip — what the value it shows *is*.
   *
   * Not its accessible name: the trigger shows the current value ("utf-8",
   * "LF"), and that visible text is what someone would say out loud, so it has
   * to be what the name is ([WCAG 2.5.3](https://www.w3.org/TR/WCAG22/#label-in-name)).
   */
  label: string
  triggerClassName?: string
  /** Which way the panel opens from its anchor. */
  placement?: "top" | "bottom"
  /** Which edge it aligns to, for an anchor near the window edge. */
  align?: "start" | "end"
  /**
   * Run when the menu opens.
   *
   * What these menus list — a folder, the file's symbols, the repository's
   * branches — is only worth fetching once someone asks to see it.
   */
  onOpen?: () => void
  /** Extra classes for the panel, typically a width and a scroll cap. */
  className?: string
  children: ReactNode
}

export function Dropdown({
  trigger,
  label,
  triggerClassName = "",
  placement = "top",
  align = "start",
  onOpen,
  className = "",
  children,
}: DropdownProps) {
  return (
    <Menu.Root
      positioning={{ placement: `${placement}-${align}` }}
      onOpenChange={(e) => e.open && onOpen?.()}
      // A closed menu should be gone, not merely hidden: its rows are stale the
      // moment it shuts, and a hidden row is still a tab stop.
      lazyMount
      unmountOnExit
    >
      <Menu.Trigger title={label} className={triggerClassName}>
        {trigger}
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            className={`z-[200] min-w-[120px] rounded-md border border-line-strong bg-overlay py-1 shadow-[var(--shadow)] focus:outline-none ${className}`}
          >
            {children}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}

/** One row in a `Dropdown`: a label, optionally ticked. */
export function MenuRow({
  label,
  value,
  checked,
  onClick,
  detail,
}: {
  label: string
  /** Distinguishes rows that share a label — the encoding menu lists each
   *  charset twice, once to re-read with and once to save with. */
  value?: string
  checked?: boolean
  onClick: () => void
  /** A quiet trailing note (a line number, a folder). */
  detail?: string
}) {
  return (
    <Menu.Item
      value={value ?? label}
      onSelect={onClick}
      className={`flex cursor-default items-center justify-between gap-4 px-3 py-1.5 text-left text-sm data-[highlighted]:bg-surface ${
        checked ? "text-ink" : "text-muted"
      }`}
    >
      <Menu.ItemText className="min-w-0 flex-1 truncate">{label}</Menu.ItemText>
      {detail && <span className="flex-none text-[10px] text-faint tabular-nums">{detail}</span>}
      {checked && <CheckIcon className="h-3 w-3 flex-none text-accent" />}
    </Menu.Item>
  )
}

/** A heading over a group of rows — "Local" / "Remote", "Reopen with". */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide text-faint uppercase">
      {children}
    </div>
  )
}
