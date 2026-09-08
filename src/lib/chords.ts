/**
 * Two-key shortcuts (`⌘K` then something), the family Reado could not have.
 *
 * `⌘K` used to *be* the command palette, so it fired on the first key and there
 * was nothing left for a second one — which cost the whole `⌘K …` set VS Code
 * puts a dozen commands in. The palette now also answers to `⇧⌘P`, so `⌘K` is
 * free to be what it is everywhere else: a prefix.
 *
 * `⌘K ⌘K` still opens the palette, so the one-hand habit keeps working.
 *
 * The prefix is armed for a few seconds and then gives up; Escape cancels; an
 * unrecognised key cancels quietly rather than doing something surprising.
 */
import { create } from "zustand"
import type { MessageKey } from "@/i18n"

/** How long the prefix stays armed. Long enough to think, short enough that a
 *  forgotten `⌘K` doesn't swallow the next keystroke you meant for the editor. */
export const CHORD_TIMEOUT_MS = 3000

export interface Chord {
  /** The second key, lower-cased (`e.key`). */
  key: string
  /** Whether the second key is held with Cmd/Ctrl (`⌘K ⌘S` vs `⌘K S`). */
  mod?: boolean
  /** What the shortcuts dialog calls it. */
  labelKey: MessageKey
  /**
   * The command id to run — the same registry the menu bar, the palette and the
   * single-key bindings dispatch through.
   *
   * A chord that inlined its own behaviour would be a second implementation of
   * a command that already exists: the preview toggle was, verbatim, and fixing
   * it in the menu would have left ⌘K V doing the old thing.
   */
  command: string
}

interface ChordState {
  /** True while `⌘K` is armed and waiting for the second key. */
  pending: boolean
  arm: () => void
  cancel: () => void
}

export const useChords = create<ChordState>((set) => ({
  pending: false,
  arm: () => set({ pending: true }),
  cancel: () => set({ pending: false }),
}))

/**
 * Resolve a second keystroke against `chords`.
 *
 * Returns the matched chord, or null — the caller cancels either way, because a
 * prefix that stays armed after an unrecognised key would eat the keystroke
 * after that one too.
 */
export function matchChord(chords: Chord[], key: string, withMod: boolean): Chord | null {
  const wanted = key.toLowerCase()
  return chords.find((c) => c.key === wanted && !!c.mod === withMod) ?? null
}
