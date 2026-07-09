/**
 * A small count/status pill — the shared version of the `rounded-full` numeric
 * badge repeated across tabs, the activity bar, and toolbars. `tone` picks the
 * surface; size/position overrides go through `className` (merged with `cn`).
 */
import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "accent" | "soft" | "neutral" | "marker";

const TONE: Record<BadgeTone, string> = {
  accent: "bg-accent text-on-accent",
  soft: "bg-[color-mix(in_oklch,var(--accent-contrast)_25%,transparent)] text-ink",
  neutral: "bg-overlay text-faint",
  marker: "bg-marker text-on-accent",
};

export function Badge({
  tone = "accent",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
