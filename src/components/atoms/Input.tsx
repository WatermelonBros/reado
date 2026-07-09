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
import { type InputHTMLAttributes, type Ref } from "react";
import { cn } from "../../lib/cn";

export type InputVariant = "bordered" | "filled" | "plain";

const VARIANT: Record<InputVariant, string> = {
  bordered: "border border-line bg-surface focus:border-line-strong",
  filled: "bg-surface",
  plain: "bg-transparent",
};

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  /** Forwarded to the underlying element (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>;
}

export function Input({ variant = "bordered", className, type = "text", ...rest }: Props) {
  return (
    <input
      type={type}
      className={cn(
        "w-full rounded-md px-2.5 py-1 text-sm text-ink outline-none placeholder:text-faint",
        VARIANT[variant],
        className,
      )}
      {...rest}
    />
  );
}
