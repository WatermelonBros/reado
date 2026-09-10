/**
 * Run something on the next painted frame — or on a deadline, if none comes.
 *
 * A window that is not rendering (occluded, minimised, off-screen) is given no
 * animation frames at all, so work hung off `requestAnimationFrame` alone simply
 * never happens: a terminal opened that way showed a black pane with no shell,
 * and a pane activated that way came back with stale dimensions and no focus.
 *
 * The frame is still preferred — it is when layout is settled and measuring is
 * meaningful. The timeout is only a floor. Whichever arrives first wins, once.
 *
 * Returns a cancel function, so an effect can drop it on unmount.
 */
export function nextPaint(fn: () => void, deadlineMs = 500): () => void {
  let done = false
  const once = () => {
    if (done) return
    done = true
    fn()
  }
  const frame = requestAnimationFrame(once)
  const timer = setTimeout(once, deadlineMs)
  return () => {
    // `done` is what actually prevents the callback; releasing the frame and the
    // timer is housekeeping, and `cancelAnimationFrame` is absent outside a DOM.
    done = true
    clearTimeout(timer)
    globalThis.cancelAnimationFrame?.(frame)
  }
}
