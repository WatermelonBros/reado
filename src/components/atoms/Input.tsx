/**
 * The shared single-line text input. Carries the styling every input in Reado
 * repeated (rounded surface, muted placeholder, focus border) so call sites stop
 * re-deriving it. Defaults are overridable via `className` (merged with `cn`).
 *
 * Variants pick the surface, matching `Textarea`:
 *  - `bordered` — outlined field (search boxes, forms) — the default
 *  - `filled`   — quiet filled field, no border
 *  - `plain`    — transparent (e.g. a full-bleed command-palette search bar)
 */
import type { InputHTMLAttributes, ReactNode, Ref } from "react"
import { cn } from "@/lib/cn"

export type InputVariant = "bordered" | "filled" | "plain"

const VARIANT: Record<InputVariant, string> = {
  bordered: "border border-line bg-surface focus:border-line-strong",
  // A filled field has no border to darken on focus, so it says so with a ring
  // instead. Every field you can tab into has to show that you have.
  filled: "bg-surface focus:ring-1 focus:ring-line-strong",
  plain: "bg-transparent",
}

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
  /** A glyph inside the field, on the leading edge — the search-box shape,
   *  which three panels were each positioning by hand. */
  icon?: ReactNode
  /** A control inside the field, on the trailing edge (a clear button). */
  trailing?: ReactNode
  /** Sizing for the wrapper an `icon`/`trailing` creates; the field itself is
   *  always full width inside it. */
  wrapperClassName?: string
  /** Forwarded to the underlying element (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>
}

export function Input({
  variant = "bordered",
  className,
  type = "text",
  icon,
  trailing,
  wrapperClassName,
  ...rest
}: Props) {
  const field = (
    <input
      type={type}
      className={cn(
        "w-full rounded-md px-2.5 py-1 text-sm text-ink outline-none placeholder:text-faint",
        VARIANT[variant],
        icon ? "pl-7" : undefined,
        trailing ? "pr-7" : undefined,
        className,
      )}
      {...rest}
    />
  )
  if (!icon && !trailing) return field
  return (
    <div className={cn("relative", wrapperClassName)}>
      {icon && (
        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-faint">
          {icon}
        </span>
      )}
      {field}
      {trailing && <span className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</span>}
    </div>
  )
}
