/**
 * The mascot itself: one `<div>` showing a cell of the sprite atlas.
 *
 * No canvas, no animation library, no per-frame image — the atlas is a single
 * background and a state change is a `background-position` change, which the
 * compositor handles without touching layout.
 *
 * Frames are timed one at a time rather than on an interval, because the timings
 * are deliberately uneven (see `frames.ts`).
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import atlas from "@/assets/mascot/owl.webp"
import { ANIMATIONS, ASPECT, COLS, cellPosition, type MascotState, ROWS } from "./frames"

/** Does the system ask for less movement? Read live: a viewer can change it
 *  while the companion is on screen. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  )
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

/**
 * Walk one state's frames on their own timings.
 *
 * A chain of timeouts rather than an interval: each frame names how long it
 * holds. A non-looping animation stops on its last frame and stays there, which
 * is how "done" settles instead of celebrating forever.
 *
 * The index is reset **during the render** that brings a new animation, not in an
 * effect afterwards. An effect runs one paint too late, and for that paint the
 * new animation is being read with the old animation's index — which, when the
 * old one had more frames, is an index that does not exist. That was a crash,
 * and a crash here blanks the companion for as long as it takes to come back.
 */
function useFrame(state: MascotState, reduced: boolean): number {
  const anim = ANIMATIONS[state]
  const [at, setAt] = useState({ anim, i: 0 })
  if (at.anim !== anim) setAt({ anim, i: 0 })

  useEffect(() => {
    if (reduced) return
    let i = 0
    let timer: number | undefined
    const step = () => {
      const last = i === anim.frames.length - 1
      if (last && !anim.loop) return
      i = last ? 0 : i + 1
      setAt({ anim, i })
      timer = window.setTimeout(step, anim.frames[i].ms)
    }
    timer = window.setTimeout(step, anim.frames[0].ms)
    return () => clearTimeout(timer)
  }, [anim, reduced])

  if (reduced) return -1
  // Belt and braces for the one render where the state above has not applied yet.
  return at.anim === anim ? at.i : 0
}

export function Mascot({
  state,
  size = 180,
  className = "",
}: {
  state: MascotState
  /** Rendered height in CSS pixels; the width follows the art's aspect. */
  size?: number
  className?: string
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const i = useFrame(state, reduced)
  const anim = ANIMATIONS[state]
  // `?? still` rather than `!`: a frame that isn't there must show the state's
  // resting face, never nothing at all.
  const cell = i < 0 ? anim.still : (anim.frames[i]?.cell ?? anim.still)

  return (
    <div
      role="img"
      aria-label={t("mascot.label")}
      data-mascot-state={state}
      data-mascot-cell={cell}
      className={`bg-no-repeat ${className}`}
      style={{
        height: size,
        width: size * ASPECT,
        backgroundImage: `url(${atlas})`,
        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
        backgroundPosition: cellPosition(cell),
      }}
    />
  )
}
