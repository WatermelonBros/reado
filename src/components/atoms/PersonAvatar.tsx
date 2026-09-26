/**
 * The face beside a human message: the writer's account picture when the build
 * knows it (the official build fills the organization's), else their initials on
 * a tint of their own — the same person gets the same hue everywhere, so a thread
 * of three people reads as three people before a single name is read.
 */
import type { Person } from "@/lib/api"
import { cn } from "@/lib/cn"
import { avatarFor, useIdentity } from "@/lib/identity"

const SIZE = {
  sm: "h-4 w-4 text-[7px]",
  md: "h-5 w-5 text-[9px]",
} as const

/** A stable hue for a person: their account, else their name. */
export function personHue(key: string): number {
  let h = 0
  for (const c of key) h = (h * 31 + (c.codePointAt(0) ?? 0)) % 360
  return h
}

/** Low-chroma, mixed into the surface: a tint, never a sticker, in any theme. */
export const personTint = (hue: number) =>
  `color-mix(in oklch, oklch(0.68 0.12 ${hue}) 38%, var(--bg-elevated))`

export function PersonAvatar({
  by,
  size = "sm",
  className,
}: {
  by?: Person
  size?: keyof typeof SIZE
  className?: string
}) {
  // Subscribe so a picture that arrives later (members load after the thread) shows.
  const s = useIdentity()
  const url = avatarFor(by, s)
  const name = by?.name ?? s.account?.name ?? s.git?.name ?? ""
  const base = cn("inline-block flex-none rounded-full", SIZE[size], className)
  if (url) return <img src={url} alt="" className={cn(base, "object-cover")} />
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
  return (
    <span
      aria-hidden
      className={cn(base, "grid place-items-center leading-none font-semibold text-ink")}
      style={{ background: personTint(personHue(by?.user ?? name)) }}
    >
      {initials || "·"}
    </span>
  )
}
