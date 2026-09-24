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
 * - `activitybar.account` — bottom of the activity bar, under Settings.
 * - `settings.footer` — the settings' bottom row, beside the Reado version.
 */
export type SlotName = "activitybar.account" | "settings.footer"

/** A registered component, with an id that is stable for the life of the app. */
export interface SlotContribution {
  id: number
  Content: ComponentType
}

const slots = new Map<SlotName, SlotContribution[]>()
let nextId = 0

export function registerSlot(name: SlotName, Content: ComponentType): void {
  slots.set(name, [...(slots.get(name) ?? []), { id: nextId++, Content }])
}

export function slotContents(name: SlotName): readonly SlotContribution[] {
  return slots.get(name) ?? []
}

/** Test-only: forget every registration. */
export function resetSlotsForTest(): void {
  slots.clear()
}
