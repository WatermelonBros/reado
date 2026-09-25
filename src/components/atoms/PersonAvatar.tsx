/**
 * The face beside a human message: the writer's account picture when the build
 * knows it (the official build fills the organization's), else their initials.
 */
import type { Person } from "@/lib/api"
import { cn } from "@/lib/cn"
import { avatarFor, useIdentity } from "@/lib/identity"

export function PersonAvatar({ by, className }: { by?: Person; className?: string }) {
  // Subscribe so a picture that arrives later (members load after the thread) shows.
  const s = useIdentity()
  const url = avatarFor(by, s)
  const name = by?.name ?? s.account?.name ?? s.git?.name ?? ""
  const base = cn("inline-block h-4 w-4 flex-none rounded-full", className)
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
      className={cn(
        base,
        "grid place-items-center bg-accent/20 text-[8px] leading-none font-semibold text-accent",
      )}
    >
      {initials || "·"}
    </span>
  )
}
