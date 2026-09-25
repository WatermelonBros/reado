/**
 * Places in the interface that a build embedding Reado can fill.
 *
 * The community build registers nothing, so every slot renders nothing. The
 * official build registers its additions (the account entry, …)
 * before `boot()` renders, which is why this is a plain module-level registry and
 * not a store: the contributions are fixed per build, so nothing needs to react to
 * them changing.
 */
import type { ComponentType } from "react"

/**
 * Each slot, and the context it passes to what fills it:
 * - `activitybar.account` — bottom of the activity bar, under Settings.
 * - `settings.footer` — the settings' bottom row, beside the Reado version.
 * - `statusbar.left` — the status bar's left group, before the file path.
 * - `comment.actions` — a comment thread's header, beside its own actions; gets the
 *   comment's id and the project root it belongs to.
 *
 * Registration is typed by this map, so a contribution that needs context cannot be
 * put in a slot that gives none.
 */
export interface SlotProps {
  "activitybar.account": Record<string, never>
  "settings.footer": Record<string, never>
  "statusbar.left": Record<string, never>
  "comment.actions": { commentId: string; root: string }
}

export type SlotName = keyof SlotProps

/** A registered component, with an id that is stable for the life of the app. */
export interface SlotContribution<N extends SlotName = SlotName> {
  id: number
  Content: ComponentType<SlotProps[N]>
}

const slots = new Map<SlotName, SlotContribution[]>()
let nextId = 0

export function registerSlot<N extends SlotName>(
  name: N,
  Content: ComponentType<SlotProps[N]>,
): void {
  const entry = { id: nextId++, Content } as unknown as SlotContribution
  slots.set(name, [...(slots.get(name) ?? []), entry])
}

export function slotContents<N extends SlotName>(name: N): readonly SlotContribution<N>[] {
  return (slots.get(name) ?? []) as unknown as SlotContribution<N>[]
}

/** Test-only: forget every registration. */
export function resetSlotsForTest(): void {
  slots.clear()
}
