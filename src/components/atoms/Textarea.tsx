/**
 * The shared multi-line text field. Carries the styling every textarea in Reado
 * repeated (rounded surface, muted placeholder, resize-y) and the composer
 * keyboard convention (Cmd/Ctrl+Enter submits, Escape cancels) so call sites stop
 * re-implementing both.
 *
 * Defaults are overridable via `className` (merged with `cn`): pass sizing
 * (`min-h-*`/`max-h-*`), a different padding, or `resize-none` and it wins.
 *
 * Variants pick the surface:
 *  - `bordered` — outlined field (dialogs, forms)
 *  - `filled`   — quiet filled field, no border (inline edit, commit box)
 *  - `plain`    — transparent, for a textarea inside an already-bordered container
 */
import { type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type TextareaVariant = "bordered" | "filled" | "plain";

const VARIANT: Record<TextareaVariant, string> = {
  bordered: "border border-line bg-surface focus:border-line-strong",
  filled: "bg-surface",
  plain: "bg-transparent",
};

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: TextareaVariant;
  mono?: boolean;
  /** Cmd/Ctrl+Enter handler (the standard "submit this composer"). */
  onSubmit?: () => void;
  /** Escape handler (the standard "cancel this composer"). */
  onCancel?: () => void;
}

export function Textarea({
  variant = "bordered",
  mono = false,
  onSubmit,
  onCancel,
  className,
  onKeyDown,
  ...rest
}: Props) {
  return (
    <textarea
      onKeyDown={(e) => {
        if (onCancel && e.key === "Escape") onCancel();
        else if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        onKeyDown?.(e);
      }}
      className={cn(
        "block w-full resize-y rounded-md px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint",
        VARIANT[variant],
        mono && "font-mono",
        className,
      )}
      {...rest}
    />
  );
}
