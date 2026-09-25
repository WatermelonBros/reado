/**
 * Dev-only: fill every slot with a labelled placeholder, so where a slot sits can
 * be checked in the running app without the build that fills it for real.
 *
 *   VITE_PREVIEW_SLOTS=1 pnpm tauri:dev
 *
 * `boot()` loads this only under that flag in a dev build; it never ships.
 */
import { registerSlot } from "./slots"

const SLOTS = [
  "activitybar.account",
  "settings.footer",
  "statusbar.left",
  "comment.actions",
] as const

function Placeholder({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-dashed border-accent px-1 font-mono text-[10px] text-accent"
    >
      {name.split(".").pop()}
    </span>
  )
}

export function previewSlots(): void {
  for (const name of SLOTS) registerSlot(name, () => <Placeholder name={name} />)
}
