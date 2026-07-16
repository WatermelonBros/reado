/**
 * The shared icon-only button — the single component for Reado's many clickable
 * glyphs (toolbar/panel-header/tab actions), so their size, hover, active tint,
 * focus ring and tooltip are defined once instead of hand-rolled at each call
 * site.
 *
 * `label` is required: it is both the accessible name (`aria-label`) and the
 * tooltip text (via the Ark-based `Tooltip`). A toggle passes `active` (rendered
 * accent-tinted, `aria-pressed`); a destructive action passes `danger`.
 */
import { type ButtonHTMLAttributes, type ReactNode, isValidElement, cloneElement } from "react";
import { Tooltip } from "./Tooltip";
import { cn } from "../../lib/cn";

export type IconButtonSize = "sm" | "md";

const SIZE: Record<IconButtonSize, string> = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Accessible name + tooltip text (required — an icon alone is not a label). */
  label: string;
  icon: ReactNode;
  /** Toggle-on state: accent tint + `aria-pressed`. */
  active?: boolean;
  /** Destructive action: marker colour. */
  danger?: boolean;
  size?: IconButtonSize;
  /** Preferred tooltip side. */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
}

export function IconButton({
  label,
  icon,
  active,
  danger = false,
  size = "md",
  tooltipPlacement,
  className = "",
  type = "button",
  ...rest
}: Props) {
  const tone = danger
    ? "text-faint hover:bg-overlay hover:text-marker"
    : active
      ? "text-accent hover:bg-overlay"
      : "text-faint hover:bg-overlay hover:text-ink";
  // Active toggles read as "primary colour + duotone" (the app's accent language,
  // matching the activity bar) — render the Phosphor glyph duotone when on.
  const glyph =
    active && isValidElement(icon)
      ? cloneElement(icon as React.ReactElement<{ weight?: string }>, { weight: "duotone" })
      : icon;
  return (
    <Tooltip label={label} placement={tooltipPlacement}>
      <button
        // eslint-disable-next-line react/button-has-type
        type={type}
        aria-label={label}
        // A toggle (caller passes `active`) always exposes aria-pressed
        // true/false; a plain action (active undefined) omits it entirely.
        aria-pressed={active}
        className={cn(
          "grid flex-none place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
          SIZE[size],
          tone,
          className,
        )}
        {...rest}
      >
        {glyph}
      </button>
    </Tooltip>
  );
}
