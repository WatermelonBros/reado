/**
 * The app's live region: one element, off-screen, that a screen reader watches.
 *
 * Two regions rather than one, because `aria-live` cannot be changed on the fly
 * and be trusted — a reader may have already latched the old value. The polite
 * one carries state (where the caret is, how many matches there are); the
 * assertive one interrupts, and is for the things that would otherwise be missed
 * entirely (a failure, a refusal).
 *
 * Visually hidden, not `display: none` — a hidden element is not announced at
 * all, which is the mistake this pattern exists to avoid.
 */
import { useAnnouncer } from "@/lib/a11y"

const HIDDEN = "sr-only"

export function Announcer() {
  const message = useAnnouncer((s) => s.message)
  const nonce = useAnnouncer((s) => s.nonce)
  const assertive = useAnnouncer((s) => s.assertive)

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className={HIDDEN}>
        {/* The nonce is in the key, not the text: re-mounting is what makes a
            repeated message a new announcement rather than a no-op. */}
        {!assertive && <span key={nonce}>{message}</span>}
      </div>
      <div aria-live="assertive" aria-atomic="true" role="alert" className={HIDDEN}>
        {assertive && <span key={nonce}>{message}</span>}
      </div>
    </>
  )
}
