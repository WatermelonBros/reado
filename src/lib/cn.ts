/**
 * `cn` — merge Tailwind class strings so a component's opinionated defaults can be
 * cleanly overridden by a caller's `className` (later wins, conflicts resolved).
 * Lets the shared atoms carry full default styling without brittle string order.
 */
import { twMerge } from "tailwind-merge";

export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
