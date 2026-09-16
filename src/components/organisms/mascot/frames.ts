/**
 * What the mascot looks like in each state, as cells of `owl.webp`.
 *
 * The atlas is a 4×3 grid of twelve drawings, all cut to one shared box, so the
 * owl's body sits on the same pixels in every cell: switching cells moves its
 * face and nothing else. Cell *numbers* are the contract with
 * `scripts/mascot-atlas.py` — a cell may be redrawn, never reordered.
 *
 * A state is a list of (cell, how long it stays). Written out frame by frame
 * rather than as a frame rate because these are not evenly timed: a blink is two
 * frames of a tenth of a second inside four seconds of stillness, and an even
 * cadence is exactly what makes a character look mechanical.
 */

/** The atlas grid. */
export const COLS = 4
export const ROWS = 3

/** What the companion can be showing. `talk` is not a state of its own — it is
 *  what any state does while a bubble is up — but it owns cells, so it lives
 *  here beside the others. */
export type MascotState = "idle" | "think" | "talk" | "done" | "ask"

export interface Frame {
  /** Index into the atlas, row-major. */
  cell: number
  /** Milliseconds this frame is held. */
  ms: number
}

export interface Animation {
  frames: Frame[]
  /** Loop forever, or play once and hold the last frame. */
  loop: boolean
  /** The single frame to show when the system asks for reduced motion — the one
   *  that carries the state's meaning on its own. */
  still: number
}

export const ANIMATIONS: Record<MascotState, Animation> = {
  // Still, with a double blink now and then. The long hold is what keeps it from
  // reading as an animation running in the corner of the eye.
  idle: {
    frames: [
      { cell: 0, ms: 4200 },
      { cell: 1, ms: 120 },
      { cell: 0, ms: 160 },
      { cell: 1, ms: 120 },
    ],
    loop: true,
    still: 0,
  },
  // Lids at half mast, gaze drifting, a blink at the far end. Slow: this one is
  // on screen for minutes at a time.
  think: {
    frames: [
      { cell: 4, ms: 900 },
      { cell: 5, ms: 900 },
      { cell: 4, ms: 700 },
      { cell: 1, ms: 130 },
    ],
    loop: true,
    still: 4,
  },
  // The beak opening and closing. Fast, and only while there is a bubble to
  // explain it — a mouth moving in silence is unsettling.
  talk: {
    frames: [
      { cell: 0, ms: 90 },
      { cell: 2, ms: 90 },
      { cell: 3, ms: 110 },
      { cell: 2, ms: 90 },
    ],
    loop: true,
    still: 0,
  },
  // Brightens, grins, settles — then stays content. Played once: arriving is the
  // event, and a celebration on a loop stops meaning anything.
  done: {
    frames: [
      { cell: 6, ms: 130 },
      { cell: 7, ms: 900 },
      { cell: 8, ms: 0 },
    ],
    loop: false,
    still: 8,
  },
  // Eyes wide, head leaning, holding the question with the odd blink. This one
  // loops: the question stands until someone answers it.
  ask: {
    frames: [
      { cell: 9, ms: 140 },
      { cell: 10, ms: 2600 },
      { cell: 11, ms: 130 },
      { cell: 10, ms: 2200 },
      { cell: 11, ms: 130 },
    ],
    loop: true,
    still: 10,
  },
}

/** Where cell `n` sits, as a CSS `background-position` percentage pair.
 *
 *  With `background-size` at `COLS*100% ROWS*100%`, the position is a fraction of
 *  the *leftover* space, not of the image — hence the division by `COLS - 1`. */
export function cellPosition(cell: number): string {
  const x = (cell % COLS) / (COLS - 1)
  const y = Math.floor(cell / COLS) / (ROWS - 1)
  return `${x * 100}% ${y * 100}%`
}

/** The character's aspect ratio, from the shared crop every frame was cut with. */
export const ASPECT = 390 / 480
