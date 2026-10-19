/**
 * The shared text button, so every button in Reado uses one consistent set of
 * surfaces, sizes, focus rings and disabled states instead of re-deriving them
 * from Tailwind at each call site.
 *
 * Variants:
 *  - `primary`   — accent fill for the main affirmative action
 *  - `secondary` — bordered, quiet
 *  - `ghost`     — text-only, hover surface (the default for toolbar actions)
 *  - `danger`    — destructive action, marker colour
 */
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md"

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--control-outline)] bg-accent text-on-accent shadow-[var(--control-shadow)] hover:opacity-90",
  secondary: "border border-line text-ink shadow-[var(--control-shadow)] hover:bg-overlay",
  ghost: "text-muted hover:bg-overlay hover:text-ink",
  danger: "text-marker hover:bg-surface",
}

const SIZE: Record<ButtonSize, string> = {
  sm: "h-[var(--control-sm)] gap-1 px-2 text-xs",
  md: "h-[var(--control-md)] gap-1.5 px-3 text-sm",
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-md [font-weight:var(--control-weight)] transition-[color,background-color,opacity,translate,box-shadow] active:translate-x-px active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
